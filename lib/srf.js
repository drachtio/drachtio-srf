const drachtio = require('./connect');
const Dialog = require('./dialog') ;
const assert = require('assert') ;
const Emitter = require('events') ;
const delegate = require('delegates') ;
const parser = require('./sip-parser/parser');
const methods = require('sip-methods') ;
const SipError = require('./sip_error') ;
const debug = require('debug')('drachtio:srf') ;
const Socket = require('net').Socket;
const noop = () => {};
const idgen = require('short-uuid')();
const sdpTransform = require('sdp-transform');

class DialogState {}
class DialogDirection {}

DialogState.Trying = 'trying';
DialogState.Proceeding = 'proceeding';
DialogState.Early = 'early';
DialogState.Confirmed = 'confirmed',
DialogState.Terminated = 'terminated';
DialogState.Rejected = 'rejected';
DialogState.Cancelled = 'cancelled';

DialogDirection.Initiator = 'initiator';
DialogDirection.Recipient = 'recipient';

const sleepFor = async(ms) => await new Promise((resolve) => setTimeout(resolve, ms));

const noncopyableHdrs = ['via', 'from', 'to', 'call-id', 'cseq', 'contact', 'content-length', 'content-type'];
function copyAllHeaders(headers, obj) {
  if (headers) Object.keys(headers).forEach((h) => {
    if (!noncopyableHdrs.includes(h) && !obj[h]) obj[h] = headers[h];});
}
function possiblyRemoveHeaders(hdrList, obj) {
  hdrList.forEach((h) => {
    const arr = /^-(.*)$/.exec(h);
    if (arr) {
      let hdr = arr[1];
      if (!hdr.startsWith('X-') && hdr !== 'Diversion') hdr = hdr.toLowerCase();
      delete obj[hdr];
    }
  });

}
/**
 * Applications create an instance of Srf in order to create and manage SIP [Dialogs]{@link Dialog}
 * and SIP transactions.  An application may have one or more Srf instances, although for most cases a single
 * instance is sufficient.
 */
class Srf extends Emitter {

  /**
   * Creates an instance of an signaling resource framework.
   * @param {string|Array} tag a string or array of strings, representing tag values for this application.
   * Tags can be used in conjunction with a call routing web callback to direct requests to particular applications.
   */
  constructor(app) {
    super() ;

    // preferred method of constructing an Srf object is simply:
    // const srf = new Srf() ;
    // or
    // const srf = new Srf('tag-value');
    // or
    // const srf = new Srf(['tag1', 'tag2']);
    // then ..
    // srf.connect(), or srf.listen()
    //

    this._dialogs = new Map() ;
    this._tags = [];

    if (typeof app === 'function') this._app = app;  //deprecated
    else if (typeof app === 'string') this._tags.push(app);
    else if (Array.isArray(app) && app.every((t) => typeof t === 'string')) this._tags = app;

    assert(this._tags.length <= 20, 'Srf#constructor: only 20 tags may be supplied');
    assert(this._tags.every((t) => t.length <= 32), 'Srf#constructor: tag values must be 32 characters or less');
    assert(this._tags.every((t) => /^[a-zA-Z0-9-_+@:]+$/.test(t)),
      'Srf#constructor: tag values may only contain characters a-zA-Z0-9-_+@:');

    if (!this._app) {
      this._app = drachtio() ;
      ['connect', 'listening', 'reconnecting', 'error', 'close'].forEach((evt) => {
        this._app.on(evt, (...args) => setImmediate(() => this.emit(evt, ...args)));
      }) ;

      if (typeof app === 'object' && !Array.isArray(app)) {
        assert.equal(typeof app.host,  'string', 'invalid drachtio connection opts') ;

        const opts = app ;
        this._app.connect(opts) ;
      }
    }

    this._app.use(this.dialog()) ;
  }

  on(event, fn) {
    //cdr events are handled through a different mechanism - we register with the server
    if (0 === event.indexOf('cdr:')) {
      return this._app.on(event, fn) ;
    }

    //delegate to EventEmitter
    return Emitter.prototype.on.apply(this, arguments)  ;
  }

  get app() {
    return this._app ;
  }

  connect(opts, callback) {
    let args = opts;
    if (this._tags.length) args = Object.assign({}, opts, {tags: this._tags});
    return this.app.connect(args, callback);
  }

  listen(opts, callback) {
    if (this._tags.length) Object.assign(opts, {tags: this._tags});
    return this.app.listen(opts, callback);
  }
  /*
   * drachtio middleware that enables Dialog handling
   * @param  {Object} opts - configuration arguments, if any (currently unused)
   */
  dialog(opts) {
    opts = opts || {} ;

    return (req, res, next) => {

      debug(`examining ${req.method}, dialog id: ${req.stackDialogId}`);
      if (req.stackDialogId && this._dialogs.has(req.stackDialogId)) {
        debug('calling dialog handler');
        this._dialogs.get(req.stackDialogId).handle(req, res, next) ;
        return ;
      }
      req.srf = res.srf = this;
      next() ;
    } ;
  }

  /**
   * create a SIP dialog, acting as a UAS (user agent server); i.e.
   * respond to an incoming SIP INVITE with a 200 OK
   * (or to a SUBSCRIBE request with a 202 Accepted).
   *
   * Note that the {@link Dialog} is generated (i.e. the callback invoked / the Promise resolved)
   * at the moment that the 200 OK is sent back towards the requestor, not when the ACK is subsequently received.
   * @param  {Object} req the incoming sip request object
   * @param  {Object} res the sip response object
   * @param  {Object} opts configuration options
   * @param {string} opts.localSdp the local session description protocol to include in the SIP response
   * @param {Object} [opts.headers] SIP headers to include on the SIP response to the INVITE
   * @param  {function} [callback] if provided, callback with signature <code>(err, dialog)</code>
   * @return {Srf|Promise} if a callback is supplied, a reference to the Srf instance.
   * <br/>If no callback is supplied, then a Promise that is resolved
   * with the [sip dialog]{@link Dialog} that is created.
   *
   * @example <caption>returning a Promise</caption>
   * const Srf = require('drachtio-srf');
   * const srf = new Srf();
   *
   * srf.invite((req, res) => {
   *   const mySdp; // populated somehow with SDP we want to answer in 200 OK
   *   srf.createUas(req, res, {localSdp: mySdp})
   *     .then((uas) => {
   *       console.log(`dialog established, remote uri is ${uas.remote.uri}`);
   *       uas.on('destroy', () => {
   *         console.log('caller hung up');
   *       });
   *     })
   *     .catch((err) => {
   *       console.log(`Error establishing dialog: ${err}`);
   *     });
   * });
   * @example <caption>using callback</caption>
   * const Srf = require('drachtio-srf');
   * const srf = new Srf();
   *
   * srf.invite((req, res) => {
   *   const mySdp; // populated somehow with SDP we want to offer in 200 OK
   *   srf.createUas(req, res, {localSdp: mySdp},
   *     (err, uas) => {
   *       if (err) {
   *         return console.log(`Error establishing dialog: ${err}`);
   *       }
   *       console.log(`dialog established, local tag is ${uas.sip.localTag}`);
   *       uas.on('destroy', () => {
   *         console.log('caller hung up');
   *       });
   *     });
   * });
   * @example <caption>specifying standard or custom headers</caption>
   * srf.createUas(req, res, {
   *     localSdp: mySdp,
   *     headers: {
   *       'User-Agent': 'drachtio/iechyd-da',
   *       'X-Linked-UUID': '1e2587c'
   *     }
   *   }).then((uas) => { ..});
   */
  createUAS(req, res, opts = {}, callback) {
    opts.headers = opts.headers || {} ;
    const body = opts.body || opts.localSdp;
    const generateSdp = typeof body === 'function' ? body : () => opts.localSdp;
    assert(typeof generateSdp === 'function');

    const __fail = (err, callback) => {
      debug(`createUAS failed with ${err}`);
      callback(err);
    };

    if (req.method === 'INVITE'
      && opts.dialogStateEmitter && opts.dialogStateEmitter.listenerCount('stateChange') > 0) {
      if (!req._dialogState) {
        const from = req.getParsedHeader('from');
        const uri = Srf.parseUri(from.uri);
        if (uri.user && uri.host) {
          req._dialogState = {
            state: DialogState.Trying,
            direction: DialogDirection.Initiator,
            aor: `${uri.user || 'unknown'}@${uri.host || 'unknown'}`,
            callId: req.get('Call-ID'),
            localTag: from.params.tag,
            id: idgen.new()
          };
          opts.dialogStateEmitter.emit('stateChange', req._dialogState);
        }
      }
    }

    const __send = (content, callback) => {
      let called = false;
      debug('createUAS sending');

      req.on('cancel', () => {
        req.canceled = called = true ;
        if (req._dialogState) {
          Object.assign(req._dialogState, {state: DialogState.Cancelled});
          opts.dialogStateEmitter.emit('stateChange', req._dialogState);
        }
        callback(new SipError(487, 'Request Terminated')) ;
      }) ;

      return res.send(req.method === 'INVITE'  ? 200 : 202, {
        headers: opts.headers,
        body: content
      }, (err, response) => {
        if (err) {
          debug(`createUAS: send failed with ${err}`);
          if (req._dialogState) {
            Object.assign(req._dialogState, {
              state: DialogState.Rejected
            });
            opts.dialogStateEmitter.emit('stateChange', req._dialogState);
          }
          if (!called) {
            called = true;
            callback(err);
          }
          return;
        }

        if (req._dialogState) {
          const to = response.getParsedHeader('to');
          Object.assign(req._dialogState, {
            state: DialogState.Confirmed,
            localTag: to.params.tag
          });
          opts.dialogStateEmitter.emit('stateChange', req._dialogState);
        }


        // note: we used to invoke callback after ACK was received
        // now we send it at the time we send the 200 OK
        // this is in keeping with the RFC 3261 spec
        const dialog = new Dialog(this, 'uas', {req: req, res: res, sent: response}) ;
        if (req._dialogState) {
          dialog.stateEmitter = {
            emitter: opts.dialogStateEmitter,
            state: req._dialogState
          };
        }

        this.addDialog(dialog);
        callback(null, dialog);

        if ('INVITE' === req.method) {
          dialog.once('ack', () => {
            // should we emit some sort of event?
          }) ;
        }
      });
    };

    const __x = async(callback) => {
      try {
        const sdp = await generateSdp();
        debug({sdp}, `createUAS - generateSdp returned ${sdp}`);
        __send(sdp, callback);
      } catch (err) {
        __fail(err, callback);
      }
    };

    if (callback) {
      __x(callback) ;
      return this ;
    }

    return new Promise((resolve, reject) => {
      __x((err, dialog) => {
        if (err) return reject(err);
        resolve(dialog);
      });
    });
  }

  /**
  * create a SIP dialog, acting as a UAC (user agent client)
  *
  * @param  {string}   uri -  request uri to send to
  * @param  {Object}  opts   configuration options
  * @param  {Object}  [opts.headers] SIP headers to include on the SIP INVITE request
  * @param  {string}  opts.localSdp the local session description protocol to include in the SIP INVITE request
  * @param  {string}  [opts.proxy] send the request through an outbound proxy,
  * specified as full sip uri or address[:port]
  * @param  {Object|Function}  opts.auth sip credentials to use if challenged,
  * or a function invoked with (req, res) and returning (err, username, password) where req is the
  * request that was sent and res is the response that included the digest challenge
  * @param  {string}  opts.auth.username sip username
  * @param  {string}  opts.auth.password sip password
  * @param  {Object} [progressCallbacks] callbacks providing call progress notification
  * @param {Function} [progressCallbacks.cbRequest] - callback that provides request sent over the wire,
  * with signature (req)
  * @param {Function} [progressCallbacks.cbProvisional] - callback that provides a provisional response
  * with signature (provisionalRes)
  * @param  {function} [callback] if provided, callback with signature <code>(err, dialog)</code>
  * @return {Srf|Promise} if a callback is supplied, a reference to the Srf instance.
  * <br/>If no callback is supplied, then a Promise that is resolved
  * with the [sip dialog]{@link Dialog} that is created.
  * @example <caption>returning a Promise</caption>
  * const Srf = require('drachtio-srf');
  * const srf = new Srf();
  *
  * const mySdp; // populated somehow with SDP we want to offer
  * srf.createUac('sip:1234@10.10.100.1', {localSdp: mySdp})
  *   .then((uac) => {
  *     console.log(`dialog established, call-id is ${uac.sip.callId}`);
  *     uac.on('destroy', () => {
  *       console.log('called party hung up');
  *     });
  *   })
  *   .catch((err) => {
  *     console.log(`INVITE rejected with status: ${err.status}`);
  *   });
  * });
  * @example <caption>Using a callback</caption>
  * const Srf = require('drachtio-srf');
  * const srf = new Srf();
  *
  * const mySdp; // populated somehow with SDP we want to offer
  * srf.createUac('sip:1234@10.10.100.1', {localSdp: mySdp},
  *    (err, uac) => {
  *      if (err) {
  *        return console.log(`INVITE rejected with status: ${err.status}`);
  *      }
  *     uac.on('destroy', () => {
  *       console.log('called party hung up');
  *     });
  *   });
  * @example <caption>Canceling a request by using a progress callback</caption>
  * const Srf = require('drachtio-srf');
  * const srf = new Srf();
  *
  * const mySdp; // populated somehow with SDP we want to offer
  * let inviteSent;
  * srf.createUAC('sip:1234@10.10.100.1', {localSdp: mySdp},
  *   {
  *     cbRequest: (reqSent) => { inviteSent = req; }
  *   })
  *   .then((uac) => {
  *     // unexpected, in this case
  *     console.log('dialog established before we could cancel');
  *   })
  *   .catch((err) => {
  *     assert(err.status === 487); // expected sip response to a CANCEL
  *   });
  * });
  *
  * // cancel the request after 0.5s
  * setTimeout(() => {
  *   inviteSent.cancel();
  * }, 500);
  */
  createUAC(uri, opts, cbRequest, cbProvisional, callback) {
    let redirectCount = 0;
    if (typeof uri === 'object') {
      callback = cbProvisional ;
      cbProvisional = cbRequest ;
      cbRequest = opts ;
      opts = uri ;
    }
    else {
      opts.uri = uri ;
    }
    const usingTls = opts.uri.startsWith('sips');

    // new signature: uri, opts, {cbRequest, cbProvisional}, callback
    if (cbRequest && typeof cbRequest === 'object') {
      callback = cbProvisional ;
      const obj = cbRequest ;
      cbRequest = obj.cbRequest || noop;
      cbProvisional = obj.cbProvisional || noop;
    }
    else {
      cbProvisional = cbProvisional || noop ;
      cbRequest = cbRequest || noop;
    }

    const __x = (callback) => {
      const method = opts.method || 'INVITE' ;
      opts.headers = opts.headers || {} ;

      assert.ok(method === 'INVITE' || method === 'SUBSCRIBE', 'method must be either INVITE or SUBSCRIBE') ;
      assert.ok(!!opts.uri, 'uri must be specified') ;

      const parsed = parser.parseUri(opts.uri) ;
      if (!parsed) {
        if (-1 === opts.uri.indexOf('@') && 0 !== opts.uri.indexOf('sip:')) {
          const address = opts.uri ;
          opts.uri = 'sip:' + (opts.calledNumber ? opts.calledNumber + '@' : '') + address ;
        }
        else if (0 !== opts.uri.indexOf('sip:')) {
          opts.uri = 'sip:' + opts.uri ;
        }
      }

      let from;
      if (opts.callingNumber) {
        if (opts.callingName) {
          from = `"${opts.callingName}" <${usingTls ? 'sips' : 'sip'}:${opts.callingNumber}@localhost>`;
        } else {
          from = `${usingTls ? 'sips' : 'sip'}:${opts.callingNumber}@localhost`;
        }
      }

      if (from) {
        if (!opts.headers.from && !opts.headers.From) opts.headers.from = from;
        if (!opts.headers.contact && !opts.headers.Contact) opts.headers.contact = from;
      }
      const is3pcc = !opts.localSdp && 'INVITE' === method ;

      const launchRequest = (uri, method, opts, callback) => {
        debug({sdp: opts.localSdp}, 'createUAC sending INVITE');
        this._app.request({
          uri,
          method: method,
          proxy: opts.proxy,
          headers: opts.headers,
          body: opts.localSdp,
          auth: opts.auth,
          _socket: opts._socket
        },
        (err, req) => {
          if (err) {
            cbRequest(err);
            return callback(err) ;
          }
          if ('INVITE' === method &&
            opts.dialogStateEmitter && opts.dialogStateEmitter.listenerCount('stateChange') > 0) {

            const from = req.getParsedHeader('from');
            const to = req.getParsedHeader('to');
            const uri = Srf.parseUri(to.uri);
            if (uri.user && uri.host) {
              req._dialogState = {
                state: DialogState.Trying,
                direction: DialogDirection.Recipient,
                aor: `${uri.user || 'unknown'}@${uri.host || 'unknown'}`,
                callId: req.get('Call-ID'),
                localTag: from.params.tag,
                id: idgen.new()
              };
            }
            opts.dialogStateEmitter.emit('stateChange', req._dialogState);
          }
          cbRequest(null, req) ;

          req.on('response', (res, ack) => {
            if (res.status < 200) {
              if (req._dialogState && req._dialogState.state !== DialogState.Early) {
                const to = res.getParsedHeader('to');
                if (to.params.tag) {
                  Object.assign(req._dialogState, {remoteTag: to.params.tag, state: DialogState.Early});
                  opts.dialogStateEmitter.emit('stateChange', req._dialogState);
                }
                else if (req._dialogState.state === DialogState.Trying) {
                  Object.assign(req._dialogState, {state: DialogState.Proceeding});
                  opts.dialogStateEmitter.emit('stateChange', req._dialogState);
                }
              }
              cbProvisional(res) ;
              if (res.has('RSeq')) {
                ack() ; // send PRACK
              }
            }
            else if (opts.followRedirects &&
              res.status >= 300 && res.status <= 399 &&
              ++redirectCount < 5 && res.has('Contact')) {
              const contact = res.getParsedHeader('Contact');
              if (!contact || 0 === contact.length) {
                const error = new SipError(res.status, res.reason) ;
                error.res = res ;
                return callback(error) ;
              }

              let newUri;
              if (opts.keepUriOnRedirect) {
                newUri = req.uri;
                opts.proxy = contact[0].uri;
              }
              else {
                newUri = contact[0].uri;
              }
              setImmediate((launchRequest.bind(this, newUri, method, opts, callback)));
              return;
            }

            else {
              if (req._dialogState) {
                const to = res.getParsedHeader('to');
                const state = (200 === res.status ?
                  DialogState.Confirmed :
                  (487 === res.status ? DialogState.Cancelled : DialogState.Rejected));
                Object.assign(req._dialogState, {
                  remoteTag: to.params.tag,
                  state});
                opts.dialogStateEmitter.emit('stateChange', req._dialogState);
              }
              if (is3pcc && 200 === res.status && !!res.body) {

                if (opts.noAck === true) {

                  // caller is responsible for invoking ack function with sdp they want to offer
                  return callback(null, {
                    sdp: res.body,
                    ack: (localSdp) => {
                      return new Promise((resolve) => {
                        ack({body: localSdp}) ;

                        const dialog = new Dialog(this, 'uac', {req: req, res: res, auth: opts.auth}) ;
                        dialog.local.sdp = localSdp ;
                        this.addDialog(dialog) ;
                        resolve(dialog) ;
                      });
                    },
                    res
                  });
                }
                const parsed = sdpTransform.parse(res.body);
                parsed.direction = 'recvonly';
                const bhSdp = sdpTransform.write(parsed);
                ack({
                  body: bhSdp
                }) ;
              }
              else if (method === 'INVITE') {
                ack() ;
              }

              if ((200 === res.status && method === 'INVITE') ||
                  ((202 === res.status || 200 === res.status) && method === 'SUBSCRIBE')) {
                const dialog = new Dialog(this, 'uac', {req: req, res: res, auth: opts.auth}) ;
                if (req._dialogState) {
                  dialog.stateEmitter = {
                    emitter: opts.dialogStateEmitter,
                    state: req._dialogState
                  };
                }
                this.addDialog(dialog) ;
                return callback(null, dialog) ;
              }
              const error = new SipError(res.status, res.reason) ;
              error.res = res ;
              callback(error) ;
            }
          }) ;
        });
      };
      launchRequest(opts.uri, method, opts, callback);
    };

    if (callback) {
      __x(callback) ;
      return this ;
    }

    return new Promise((resolve, reject) => {
      __x((err, dialog) => {
        if (err) return reject(err);
        resolve(dialog);
      });
    });
  }

  /**
  * create back-to-back dialogs; i.e. act as a back-to-back user agent (B2BUA), creating a
  * pair of dialogs {uas, uac} -- a UAS dialog facing the caller or A party, and a UAC dialog
  * facing the callee or B party such that media flows between them
  * @param  {Object}  req  - incoming sip request object
  * @param  {Object}  res  - incoming sip response object
  * @param  {string}  uri - sip uri or IP address[:port] to send the UAC INVITE to
  * @param  {Object}  opts -   configuration options
  * @param {Object} [opts.headers] SIP headers to include on the SIP INVITE request to the B party
  * @param {Object} [opts.responseHeaders] SIP headers to include on responses to the A party.
  * Either an object containing SIP headers, or a function returning an object may be provided.
  * If a function is provided, it will be called with the signature (uacRes, headers),
  * where 'uacRes' is the response received from the B party, and 'headers' are the SIP headers
  * that have currently been set for the response.
  * @param {string|function} [opts.localSdpA] the local session description protocol
  * to offer in the response to the SIP INVITE request on the A leg; either a string or a function
  * may be provided. If a function is
  * provided, it will be invoked with two parameters (sdp, res) correspnding to the SDP received from the B
  * party, and the sip response object received on the response from B.
  * The function must return either the SDP (as a string)
  * or a Promise that resolves to the SDP. If no value is provided (neither string nor function), then the SDP
  * returned by the B party in the provisional/final response on the UAC leg will be
  * sent back to the A party in the answer.
  * @param {string} [opts.localSdpB] the local session description protocol to offer in the SIP INVITE
  * request on the B leg
  * @param {Array} [opts.proxyRequestHeaders] an array of header names which, if they appear in the INVITE request
  * on the A leg, should be included unchanged on the generated B leg INVITE
  * @param {Array} [opts.proxyResponseHeaders] an array of header names which, if they appear
  * in the response to the outgoing INVITE, should be included unchanged on the generated response to the A leg
  * @param {Boolean} [opts.passFailure=true] specifies whether to pass a failure returned from B leg back to the A leg
  * @param {Boolean} [opts.passProvisionalResponses=true] specifies whether to pass provisional responses
  * from B leg back to the A leg
  * @param  {string}  [opts.proxy] send the request through an outbound proxy,
  * specified as full sip uri or address[:port]
  * @param  {Object|Function}  opts.auth sip credentials to use if challenged,
  * or a function invoked with (req, res) and returning (err, username, password) where req is the
  * request that was sent and res is the response that included the digest challenge
  * @param  {string}  opts.auth.username sip username
  * @param  {string}  opts.auth.password sip password
  * @param  {Object} [progressCallbacks] callbacks providing call progress notification
  * @param {Function} [progressCallbacks.cbRequest] - callback that provides request sent over the wire,
  * with signature (req)
  * @param {Function} [progressCallbacks.cbProvisional] - callback that provides a provisional response
  * with signature (provisionalRes)
  * @param {Function} [progressCallbacks.cbFinalizedUac] - callback that provides the UAC dialog as soon as
  * the 200 OK is received from the B party.  Since the UAC dialog is also returned when the B2B has been completely
  * constructed, this is mainly useful if there is some need to be notified as soon as the B party answers.
  * The callback signature is (uac).
  * @param  {function} [callback] if provided, callback with signature <code>(err, {uas, uac})</code>
  * @return {Srf|Promise} if a callback is supplied, a reference to the Srf instance.
  * <br/>If no callback is supplied, then a Promise that is resolved
  * with the [sip dialog]{@link Dialog} that is created.
  * @example <caption>simple B2BUA</caption>
  * const Srf = require('drachtio-srf');
  * const srf = new Srf();
  *
  * srf.invite((req, res) => {
  *   srf.createB2BUA('sip:1234@10.10.100.1', req, res, {localSdpB: req.body})
  *     .then(({uas, uac}) => {
  *       console.log('call connected');
  *
  *       // when one side terminates, hang up the other
  *       uas.on('destroy', () => { uac.destroy(); });
  *       uac.on('destroy', () => { uas.destroy(); });
  *     })
  *     .catch((err) => {
  *       console.log(`call failed to connect: ${err}`);
  *     });
  * });
  * @example <caption>use opts.passFailure to attempt a fallback URI on failure</caption>
  * const Srf = require('drachtio-srf');
  * const srf = new Srf();
  *
  * function endCall(dlg1, dlg2) {
  *   dlg1.on('destroy', () => {dlg2.destroy();})
  *   dlg2.on('destroy', () => {dlg1.destroy();})
  * }
  * srf.invite((req, res) => {
  *   srf.createB2BUA('sip:1234@10.10.100.1', req, res, {localSdpB: req.body, passFailure: false})
  *     .then({uas, uac} => {
  *       console.log('call connected to primary destination');
  *       endcall(uas, uac);
  *     })
  *     .catch((err) => {
  *       // try backup if we got a sip non-success response and the caller did not hang up
  *       if (err instanceof Srf.SipError && err.status !== 487) {
  *           console.log(`failed connecting to primary, will try backup: ${err}`);
  *           srf.createB2BUA('sip:1234@10.10.100.2', req, res, {
  *             localSdpB: req.body}
  *           })
  *             .then({uas, uac} => {
  *               console.log('call connected to backup destination');
  *               endcall(uas.uac);
  *             })
  *             catch((err) => {
  *               console.log(`failed connecting to backup uri: ${err}`);
  *             });
  *       }
  *     });
  * });
  * @example <caption>B2BUA with media proxy using rtpengine</caption>
  * const Srf = require('drachtio-srf');
  * const srf = new Srf();
  * const rtpengine = require('rtpengine-client').Client
  *
  * // helper functions
  *
  * // clean up and free rtpengine resources when either side hangs up
  * function endCall(dlg1, dlg2, details) {
  *   [dlg1, dlg2].each((dlg) => {
  *     dlg.on('destroy', () => {(dlg === dlg1 ? dlg2 : dlg1).destroy();});
  *     rtpengine.delete(details);
  *   });
  * }
  *
  * // function returning a Promise that resolves with the SDP to offer A leg in 18x/200 answer
  * function getSdpA(details, remoteSdp, res) {
  *   return rtpengine.answer(Object.assign(details, {
  *     'sdp': remoteSdp,
  *     'to-tag': res.getParsedHeader('To').params.tag
  *    }))
  *     .then((response) => {
  *       if (response.result !== 'ok') throw new Error(`Error calling answer: ${response['error-reason']}`);
  *       return response.sdp;
  *    })
  * }
  *
  * // handle incoming invite
  * srf.invite((req, res) => {
  *   const from = req.getParsedHeader('From');
  *   const details = {'call-id': req.get('Call-Id'), 'from-tag': from.params.tag};
  *
  *   rtpengine.offer(Object.assign(details, {'sdp': req.body})
  *     .then((rtpResponse) => {
  *       if (rtpResponse && rtpResponse.result === 'ok') return rtpResponse.sdp;
  *       throw new Error('rtpengine failure');
  *     })
  *     .then((sdpB) => {
  *       return srf.createB2BUA('sip:1234@10.10.100.1', req, res, {
  *         localSdpB: sdpB,
  *         localSdpA: getSdpA.bind(null, details)
  *       });
  *     })
  *     .then({uas, uac} => {
  *       console.log('call connected with media proxy');
  *       endcall(uas, uac, details);
  *     })
  *     .catch((err) => {
  *       console.log(`Error proxying call with media: ${err}`);
  *     });
  * });

  */
  createB2BUA(req, res, uri, opts, cbRequest, cbProvisional, callback) {
    let cbFinalizedUac = noop ;

    if (uri && typeof uri === 'object') {
      callback = cbProvisional ;
      cbProvisional = cbRequest ;
      cbRequest = opts ;
      opts = uri ;
    }
    else {

      opts = opts || {} ;
      if (typeof opts !== 'object') {
        callback = cbProvisional ;
        cbProvisional = cbRequest ;
        cbRequest = opts ;
        opts = {} ;
      }
      opts.uri = uri ;
    }

    // new signature: uri, opts, {cbRequest, cbProvisional}, callback
    if (cbRequest && typeof cbRequest === 'object') {
      callback = cbProvisional ;
      const obj = cbRequest ;
      cbRequest = obj.cbRequest || noop;
      cbProvisional = obj.cbProvisional || noop;
      cbFinalizedUac = obj.cbFinalizedUac || noop ;
    }
    else {
      cbProvisional = cbProvisional || noop ;
      cbRequest = cbRequest || noop;
    }

    assert.ok(typeof opts.uri === 'string');   // minimally, we must have a request-uri

    opts.method = req.method ;

    const proxyRequestHeaders = opts.proxyRequestHeaders || [] ;
    const proxyResponseHeaders = opts.proxyResponseHeaders || [] ;
    const propagateFailure = !(opts.passFailure === false);
    const propagateProvisional = !(opts.passProvisionalResponses === false);

    // default From, To, and user part of uri if not provided
    opts.headers = opts.headers || {} ;
    opts.responseHeaders = opts.responseHeaders || {};

    // pass specified headers on to the B leg
    if (proxyRequestHeaders[0] === 'all') {
      const reqHeaders = req.headers;
      possiblyRemoveHeaders(proxyRequestHeaders.slice(1), reqHeaders);
      copyAllHeaders(reqHeaders, opts.headers);
    } else {
      proxyRequestHeaders.forEach((hdr) => {
        const headerName = req.getHeaderName(hdr);
        if (headerName) {
          opts.headers[headerName] = req.get(hdr);
        }
      });
    }

    if (!(opts.headers.from || opts.headers.From) && !opts.callingNumber) { opts.callingNumber = req.callingNumber; }
    if (!(opts.headers.from || opts.headers.From) && !opts.callingName) { opts.callingName = req.callingName; }
    if (!(opts.headers.to || opts.headers.To) && !opts.calledNumber) { opts.calledNumber = req.calledNumber; }

    opts.localSdp = opts.localSdpB && typeof opts.localSdpB !== 'function' ? opts.localSdpB : req.body ;
    const is3pcc = !opts.localSdp || opts.noAck;
    if (is3pcc) opts.noAck = true;

    let remoteSdpB, translatedRemoteSdpB ;

    /* returns a Promise that resolves with the sdp to use responding to the A leg */
    const generateSdpA = async(res) => {
      debug('createB2BUA: generateSdpA');

      const sdpB = res.body ;
      if (res.getParsedHeader('CSeq').method === 'SUBSCRIBE' || !sdpB) {
        return sdpB ;
      }

      if (remoteSdpB && remoteSdpB === sdpB) {
        // called again with same remote SDP, return previous result
        if (translatedRemoteSdpB) return translatedRemoteSdpB;

        /* race condition: we are still producing the translatedSdp from 183 */
        await sleepFor(100);
        if (translatedRemoteSdpB) return translatedRemoteSdpB;
        await sleepFor(500);
        if (translatedRemoteSdpB) return translatedRemoteSdpB;
        await sleepFor(1000);
        return translatedRemoteSdpB;
      }

      remoteSdpB = sdpB ;
      if (!opts.localSdpA) {
        // passthru B leg SDP
        return translatedRemoteSdpB = sdpB;
      }
      else if ('function' === typeof opts.localSdpA) {
        // call function that returns either the sdp, or a Promise that resolves to the sdp
        const sdpA = await opts.localSdpA(sdpB, res);
        return translatedRemoteSdpB = sdpA;
      }
      else {
        // insert provided SDP
        return translatedRemoteSdpB = opts.localSdpA ;
      }
    };

    /* uac request sent, set handler to propagate CANCEL from A leg if we get it */
    function handleUACSent(err, uacReq) {
      if (err) {
        debug(`createB2BUA: Error sending uac request: ${err}`);
        res.send(500);
      }
      else {
        req.on('cancel', (cancelReq) => {
          debug('createB2BUA: received CANCEL from A party, sending CANCEL to B');
          res.send(487) ;
          uacReq.cancel({
            headers: copyUASHeaderToUACForOnlyCancel(cancelReq)
          }
          ) ;
        });
      }
      cbRequest(err, uacReq);
    }

    /* Special for Cancel request, we just forward hardcoded list of headers here*/
    function copyUASHeaderToUACForOnlyCancel(uasReq) {
      const headers = {};
      if (!uasReq) {
        return headers;
      }

      ['Reason', 'X-Reason']
        .forEach((hdr) => { if (uasReq.has(hdr)) headers[hdr] = uasReq.get(hdr);}) ;

      return headers ;
    }

    /* get headers from response on uac (B) leg and ready them for inclusion on our response on uas (A) leg */
    function copyUACHeadersToUAS(uacRes) {
      const headers = {};
      if (!uacRes) {
        return headers;
      }

      if (proxyResponseHeaders[0] === 'all') {
        const resHeaders = uacRes.headers;
        possiblyRemoveHeaders(proxyRequestHeaders.slice(1), resHeaders);
        copyAllHeaders(resHeaders, headers);
      }
      else {
        proxyResponseHeaders.forEach((hdr) => {
          debug(`copyUACHeadersToUAS: hdr ${hdr}`);
          const headerName = uacRes.getHeaderName(hdr);
          if (headerName) {
            debug(`copyUACHeadersToUAS: adding ${hdr}: uacRes.get(hdr)`);
            headers[headerName] = uacRes.get(hdr);
          }
        });
      }

      // after copying headers from A to B, apply any specific requested headerss
      if (typeof opts.responseHeaders === 'function') {
        Object.assign(headers, opts.responseHeaders(uacRes, headers));
      }
      else if (typeof opts.responseHeaders === 'object') {
        Object.assign(headers, opts.responseHeaders);
      }
      debug(`copyUACHeadersToUAS: ${JSON.stringify(headers)}`);
      return headers ;
    }

    /* propagate any provisional responses from uac (B) leg to uas (A) leg */
    const handleUACProvisionalResponse = async(provisionalRes, uacReq) => {
      if (provisionalRes.status > 101) {
        debug(`Srf#createB2BUA: received a provisional response ${provisionalRes.status}`) ;
        if (propagateProvisional) {
          const opts = { headers: copyUACHeadersToUAS(provisionalRes) } ;
          if (provisionalRes.body) {
            try {
              const sdpA = await generateSdpA(provisionalRes);
              opts.body = sdpA ;
              return res.send(provisionalRes.status, provisionalRes.reason, opts);
            } catch (err) {
              debug(`Srf#createB2BUA: failed in call to produceSdpForALeg: ${err.message}`);
              res.send(500) ;
              uacReq.cancel() ;
            }
          }
          else {
            res.send(provisionalRes.status, provisionalRes.reason, opts) ;
          }
        }
        else {
          debug('not propagating provisional response');
        }
      }
      cbProvisional(provisionalRes);
    };

    const __x = async(callback) => {
      debug(`createB2BUA: creating UAC, opts: ${JSON.stringify(opts)}`);

      opts._socket = req.socket ;

      // emit dialog events, per https://tools.ietf.org/html/rfc4235#section-3.7.1
      if (opts.dialogStateEmitter && opts.dialogStateEmitter.listenerCount('stateChange') > 0) {
        const from = req.getParsedHeader('from');
        const uri = Srf.parseUri(from.uri);
        if (uri.user && uri.host) {
          req._dialogState = {
            state: DialogState.Trying,
            direction: DialogDirection.Initiator,
            aor: `${uri.user || 'unknown'}@${uri.host || 'unknown'}`,
            callId: req.get('Call-ID'),
            remoteTag: from.params.tag,
            id: idgen.new()
          };
          opts.dialogStateEmitter.emit('stateChange', req._dialogState);
        }
      }

      /* ok, first create the UAC */
      let uac;
      try {
        uac = await this.createUAC(opts, {cbRequest: handleUACSent, cbProvisional: handleUACProvisionalResponse});

      } catch (err) {
        debug(`createB2BUA: received non-success ${err.status || err} on uac leg`);
        const opts = {headers: copyUACHeadersToUAS(err.res)} ;
        if (propagateFailure && !res.finalResponseSent) {
          // failed B: propagate failure to A
          res.send(err.status || 500, opts);
        }
        return callback(err);
      }

      let finalResponse, ackFunction;
      if (is3pcc) {
        /* this is a 3pcc invite, will sdp in ACK from A leg */
        const {ack, res} = uac;
        finalResponse = res;
        ackFunction = ack;
      }
      else {
        finalResponse = uac.res;
        /* success establishing uac (B) leg, now establish uas (A) leg */
        debug('createB2BUA: successfully created UAC..queueing requests..');

        /* need to hold any reINVITEs etc on the B leg until we establish A */
        uac.queueRequests = true;
        cbFinalizedUac(uac);
      }

      /* now finalize the UAS */
      let uas;
      try {
        uas = await this.createUAS(req, res, {
          headers: copyUACHeadersToUAS(finalResponse),
          localSdp: generateSdpA.bind(null, finalResponse),
          dialogStateEmitter: opts.dialogStateEmitter
        });

        if (is3pcc) {
          debug('createB2BUA: successfully created UAS..but this is 3pcc, so a bit more work to do');
          uas.once('ack', async(ackRequest) => {
            debug(`createB2BUA: got ACK from UAS, pass on sdp: ${ackRequest.body}`);
            const sdp = await (typeof opts.localSdpB === 'function' ?
              opts.localSdpB(ackRequest.body) : Promise.resolve(ackRequest.body));
            uac = await ackFunction(sdp);
            uac.other = uas;
            uas.other = uac;
            debug('createB2BUA: successfully created bot dialogs in 3pcc!');
            return callback(null, {uac, uas});  // successfully connected!  resolve promise with both dialogs
          });
          return;
        }

        debug('createB2BUA: successfully created UAS..done!');
        uas.once('ack', () => {
          debug('createB2BUA: got ACK from UAS, process any queued UAC requests');
          uac.queueRequests = false;
        });
        uac.other = uas;
        uas.other = uac;
        return callback(null, {uac, uas});  // successfully connected!  resolve promise with both dialogs
      } catch (err) {
        debug({err}, 'createB2BUA: failed creating UAS..done!');
        uac && uac.destroy().catch(() => {}) ;  // failed A leg after success on B: tear down B
        return callback(err) ;
      }
    };

    if (callback) {
      __x(callback) ;
      return this ;
    }

    return new Promise((resolve, reject) => {
      __x((err, dialogs) => {
        if (err) return reject(err);
        resolve(dialogs);
      });
    });
  }

  /**
  * proxy an incoming request
  * @param  {Request}   req - drachtio request object representing an incoming SIP request
  * @param {String|Array} [destination] -  an IP address[:port], or list of same, to proxy the request to
  * @param  {Object}   [opts] - configuration options for the proxy operation
  * @param {String} [opts.forking=sequential] - when multiple destinations are provided,
  * this option governs whether they are attempted sequentially or in parallel.
  * Valid values are 'sequential' or 'parallel'
  * @param {Boolean} [opts.remainInDialog=false] - if true, add Record-Route header and
  * remain in the SIP dialog (i.e. receiving futher SIP messaging for the dialog,
  * including the terminating BYE request).
  * Alias: `recordRoute`.
  * @param {String} [opts.provisionalTimeout] - timeout after which to attempt the next destination
  * if no 100 Trying response has been received.  Examples of valid syntax for this property is '1500ms', or '2s'
    * @param {String} [opts.finalTimeout] - timeout, in milliseconds, after which to cancel
    * the current request and attempt the next destination if no final response has been received.
    * Syntax is the same as for the provisionalTimeout property.
  * @param {Boolean} [opts.followRedirects=false] - if true, handle 3XX redirect responses by
  * generating a new request as per the Contact header; otherwise, proxy the 3XX response
  * back upstream without generating a new response
  * @param  {function} [callback] - callback invoked when proxy operation completes, signature (err, results)
  * where `results` is a JSON object describing the individual sip call attempts and results
  * @returns {Srf|Promise} returns a Promise if no callback is supplied, otherwise the Srf object
  * @example <caption>simple proxy</caption>
  * const Srf = require('drachtio-srf');
  * const srf = new Srf();
  *
  * srf.invite((req, res) => {
  *   srf.proxyRequest(req, 'sip.example.com');
  * });
  *
  * @example <caption>proxy with options</caption>
  * const Srf = require('drachtio-srf');
  * const srf = new Srf();
  *
  * srf.invite((req, res) => {
  *   srf.proxyRequest(req, ['sip.example1.com', 'sip.example2.com'], {
  *     recordRoute: true,
  *     followRedirects: true,
  *     provisionalTimeout: '2s'
  *   }).then((results) => {
  *     console.log(JSON.stringify(result)); // {finalStatus: 200, finalResponse:{..}, responses: [..]}
  *   });
  * });
  */
  proxyRequest(req, destination, opts, callback) {
    assert(typeof destination === 'undefined' || typeof destination === 'string' || Array.isArray(destination),
      '\'destination\' is must be a string or an array of strings') ;

    if (typeof destination === 'function') {
      callback = destination;
    }
    else if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = opts || {};
    opts.destination = destination ;

    const __x = (callback) => {
      req.proxy(opts, callback);
    };

    debug(`Srf#proxyRequest opts ${JSON.stringify(opts)}, callback ${typeof callback}`);
    if (callback) {
      __x(callback) ;
      return this ;
    }

    return new Promise((resolve, reject) => {
      __x((err, results) => {
        if (err) return reject(err);
        resolve(results);
      });
    });
  }

  /**
   * Send an outbound request outside of a Dialog.
   * @param {String} uri - request-uri
   * @param {Object} opts - options
   * @param {String} method SIP method for the request
   * @param {Object} [opts.headers] SIP headers to include on the request
   * @param {String} [body] body to include with the request
   * @param {Object} [opts.auth] authentication to use if challenged
   * @param {String} [opts.auth.username] sip username
   * @param {String} [opts.auth.password] sip password
   * @param  {function} [callback] - callback invoked when request is sent, signature (err, requestSent)
  * where `requestSent` is a SipRequest sent out over the wire
  * @returns {Srf|Promise} returns a Promise if no callback is supplied, otherwise the Srf object
   */
  request(socket, uri, opts, callback) {
    if (!(socket instanceof Socket)) {
      callback = opts;
      opts = uri;
      uri = socket;
      socket = null;
    }
    if (typeof uri === 'object') {
      callback = opts;
      opts = uri;
      uri = uri.uri;
    }
    assert.ok(typeof opts.method === 'string', 'Srf#request: opts.method is required');

    const __x = (callback) => {
      return socket ?
        this._app.request(socket, uri, opts, callback) :
        this._app.request(uri, opts, callback);
    };

    if (callback) {
      __x(callback) ;
      return this ;
    }

    return new Promise((resolve, reject) => {
      __x((err, req) => {
        if (err) return reject(err);
        resolve(req);
      });
    });
  }

  /**
   * Returns an existing dialog for a given dialog id, if it exists
   * @param {String} stackDialogId dialog id
   */
  findDialogById(stackDialogId) {
    return this._dialogs.get(stackDialogId);
  }

  /**
   * Returns an existing dialog for a given sip call-id and from tag, if it exists
   * @param {String} callId SIP Call-ID
   * @param {String} tag SIP From tag
   */
  findDialogByCallIDAndFromTag(callId, tag) {
    // NB: if drachtio server ever changes its convention, this will break!!
    const stackDialogId = `${callId};from-tag=${tag}`;
    return this._dialogs.get(stackDialogId);
  }

  addDialog(dialog) {
    this._dialogs.set(dialog.id, dialog) ;
    debug('Srf#addDialog: adding dialog with id %s type %s, dialog count is now %d ',
      dialog.id, dialog.dialogType, this._dialogs.size) ;
  }

  removeDialog(dialog) {
    this._dialogs.delete(dialog.id) ;
    debug('Srf#removeDialog: removing dialog with id %s dialog count is now %d', dialog.id, this._dialogs.size) ;
  }

  unregisterForMessages(sipVerb) {
    this._app.client.removeRoute(sipVerb) ;
  }

  reregisterForMessages(sipVerb) {
    this._app.client.route(sipVerb) ;
  }

  _b2bRequestWithinDialog(dlg, req, res, proxyRequestHeaders, proxyResponseHeaders, callback) {
    callback = callback || noop ;
    let headers = {} ;
    proxyRequestHeaders.forEach((hdr) => {
      const headerName = req.getHeaderName(hdr);
      if (headerName) {
        headers[headerName] = req.get(hdr);
      }
    }) ;
    dlg.request({
      method: req.method,
      headers: headers,
      body: req.body
    }, (err, response) => {
      headers = {} ;
      proxyResponseHeaders.forEach((hdr) => {
        if (!!response && response.has(hdr)) {
          const headerName = response.getHeaderName(hdr);
          if (headerName) {
            headers[headerName] = response.get(hdr);
          }
        }
      }) ;

      if (err) {
        debug('b2bRequestWithinDialog: error forwarding request: %s', err) ;
        res.send(response.status || 503, { headers: headers}) ;
        return callback(err) ;
      }
      let status = response.status ;

      //special case: sending a NOTIFY for subscription terminated can fail if client has already gone away
      if (req.method === 'NOTIFY' && req.has('Subscription-State') &&
        /terminated/.test(req.get('Subscription-State')) && status === 503) {
        debug('b2bRequestWithinDialog: failed forwarding a NOTIFY with ' +
          'subscription-terminated due to client disconnect') ;
        status = 200 ;
      }
      res.send(status, { headers: headers}) ;
      callback(null) ;
    });
  }

  /**
   * a SIP Dialog
   */
  static get Dialog() {
    return Dialog;
  }

  /**
   * inherits from Error and represents a non-success final SIP response to a request;
   * status and reason properties provide the numeric sip status code and the reason for the failure.
   */
  static get SipError() {
    return SipError;
  }

  /**
   * parses a SIP uri string
   * @return {function} a function that takes a SIP uri and returns an object
   * @example
   * const Srf = require('drachtio-srf');
   * const srf = new Srf();
   * const parseUri = Srf.parseUri;
   *
   * // connect, etc..
   *
   * srf.invite((req, res) => {
   *  const uri = parseUri(req.get('From'));
   *  console.log(`parsed From header: ${JSON.stringify(uri)}`);
   *  // {
   *  //   "scheme": "sip",
   *  //   "family": "ipv4",
   *  //   "user": "+15083084807",
   *  //   "host": "192.168.1.100",
   *  //   "port": 5080,
   *  //   "params": {
   *  //      "tag": "3yid87"
   *  //    }
   *  // }
   * });
   */
  static get parseUri() {
    return parser.parseUri;
  }

  static get stringifyUri() {
    return parser.stringifyUri;
  }

  static get SipMessage() {
    return require('./sip-parser/message');
  }

  static get SipRequest() {
    return require('./request');
  }
  static get SipResponse() {
    return require('./response');
  }

  static get DialogState() {
    return DialogState;
  }
  static get DialogDirection() {
    return DialogDirection;
  }
}

module.exports = exports = Srf ;

delegate(Srf.prototype, '_app')
  .method('endSession')
  .method('disconnect')
  .method('set')
  .method('get')
  .method('use')
  .access('locals')
  .getter('idle') ;

methods.forEach((method) => {
  delegate(Srf.prototype, '_app').method(method.toLowerCase()) ;
}) ;

/** send a SIP request outside of a dialog
* @name Srf#request
* @method
* @param  {string} uri - sip request-uri to send request to
* @param {Object} opts - configuration options
* @param {String} opts.method - SIP method to send (lower-case)
* @param {Object} [headers] - SIP headers to apply to the outbound request
* @param {String} [body] - body to send with the SIP request
* @param  {string}  [opts.proxy] send the request through an outbound proxy,
* specified as full sip uri or address[:port]
* @param {function} [callback] - callback invoked when sip request has been sent, invoked with
* signature (err, request) where `request` is a sip request object representing the sip
* message that was sent.
* @example <caption>sending OPTIONS request</caption>
* srf.request('sip.example.com', {
*   method: 'OPTIONS',
*   headers: {
*     'User-Agent': 'drachtio'
*   }
*  }, (err, req) => {
*   req.on('response', (res) => {
*     console.log(`received ${res.statusCode} response`);
*   });
* });
*
*/

/** make an inbound connection to a drachtio server
* @name Srf#connect
* @method
* @param  {Object} opts - connection options
* @param  {string} [opts.host=127.0.0.1] - address drachtio server is listening on for client connections
* @param  {Number} [opts.port=9022] - address drachtio server is listening on for client connections
* @param  {String} opts.secret - shared secret used to authenticate connections
* @example
* const Srf = require('drachtio-srf');
* const srf = new Srf();
*
* srf.connect({host: '127.0.0.1', port: 9022, secret: 'cymru'});
* srf.on('connect', (hostport) => {
*   console.log(`connected to drachtio server offering sip endpoints: ${hostport}`);
* })
* .on('error', (err) => {
*   console.error(`error connecting: ${err}`);
* });
*
* srf.invite((req, res) => {..});
*/

/** listen for outbound connections from a drachtio server
*   @name Srf#listen
*   @method
*   @param  {Object} opts - listen options
*   @param  {number} [opts.host=0.0.0.0] - address to bind listening socket to
*   @param  {number} opts.port - tcp port to listen on
*   @param  {string} opts.secret - shared secret used to authenticate connections
* @example
* const Srf = require('drachtio-srf');
* const srf = new Srf();
*
* srf.listen({port: 3001, secret: 'cymru'});
*
* srf.invite((req, res) => {..});
*
*/

/** terminate the tcp socket connection associated with the request or response object,
*   if the underlying socket was established as part of an outbound connection.  If
*   the underlying socket was established as part of an inbound connection, this method
*   call is a no-op (does nothing).
*   @name Srf#endSession
*   @method
*   @param  {req|res} msg - SIP request or response object
* @example
* const Srf = require('drachtio-srf');
* const srf = new Srf();
*
* srf.listen({port: 3001, secret: 'cymru'});
*
* srf.invite((req, res) => {
*   srf.createUas(req, res, {localSdp: mySdp})
*     .then((uas) => {
*       uas.on('destroy', () => {
*         console.log('caller hung up');
*         srf.endSession(req);
*       });
*     });
* });
*/

/**
 * a <code>connect</code> event is emitted by an Srf instance when a connect method completes
 * with either success or failure
 * @event Srf#connect
 * @param {Error} err - error encountered when attempting to authorize after connecting
 * @param {Array} hostport - an Array of SIP endpoints that the connected drachtio server is
 * listening on for incoming SIP messages.  The format of each endpoint is protcocol/adress:port.
 */
/**
 * an <code>error</code> event is emitted by an Srf instance when an inbound connection is lost
 * @event Srf#error
 * @param {Error} err - specific error information
 */
/**
 * a <code>cdr:attempt</code> event is emitted by an Srf instance when a call attempt has been
 * received (inbound) or initiated (outbound)
 * @event Srf#cdr:attempt
 * @param {String} source - 'network'|'application', depending on whether the INVITE is
 * \inbound (received), or outbound (sent), respectively
 * @param {String} time - the time (UTC) recorded by the SIP stack corresponding to the attempt
 * @param {Object} msg - the actual message that was sent or received
 */
/**
 * a <code>cdr:start</code> event is emitted by an Srf instance when a call attempt has been connected successfully
 * @event Srf#cdr:start
 * @param {String} source - 'network'|'application', depending on whether the INVITE is
 * inbound (received), or outbound (sent), respectively
 * @param {String} time - the time (UTC) recorded by the SIP stack corresponding to the attempt
 * @param {String} role - 'uac'|'uas'|'uac-proxy'|'uas-proxy' indicating whether the application
 * is acting as a user agent client, user agent server, proxy (sending message), or proxy
 * (receiving message) for this cdr
 * @param {Object} msg - the actual message that was sent or received
 */
/**
 * a <code>cdr:stop</code> event is emitted by an Srf instance when a connected call has ended
 * @event Srf#cdr:stop
 * @param {String} source - 'network'|'application', depending on whether the INVITE is inbound (received),
 * or outbound (sent), respectively
 * @param {String} time - the time (UTC) recorded by the SIP stack corresponding to the attempt
 * @param {String} reason - the reason the call was ended
 * @param {Object} msg - the actual message that was sent or received
 */
