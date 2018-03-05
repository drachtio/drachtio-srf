const drachtio = require('drachtio');
const Dialog = require('./dialog') ;
const assert = require('assert') ;
const Emitter = require('events').EventEmitter ;
const delegate = require('delegates') ;
const parser = require('drachtio-sip').parser ;
const methods = require('sip-methods') ;
const SipError = require('./sip_error') ;
const async = require('async') ;
const deprecate = require('deprecate');
const debug = require('debug')('drachtio-srf') ;
const noop = () => {};


/** A signaling resource framework */
class Srf extends Emitter {

  /**
   * Creates a signaling resource framework instance.<br/><br/>
   *
   * Note: It is preferred to not pass any arguments to the constructor, e.g. <br/>
   *    const srf = new Srf();
   * @param {Object} [app] - drachtio app, or connects args.
   */
  constructor(app) {
    super() ;

    assert(typeof app === 'undefined' || typeof app === 'function' || typeof app === 'object',
      'argument \'app\' if provided must be either a drachtio app or connect opts') ;

    // preferred method of constructing an Srf object is simply:
    // const srf = new Srf() ;
    // then ..
    // srf.connect(), or srf.listen()
    //
    // the old ways:
    // new Srf(connectArgs)
    // or
    // new Srf(app)
    // are deprecated

    if (typeof app !== 'undefined') {
      deprecate('Srf() constructor should be called with no arguments, ' +
        'followed by Srf#connect(opts) or Srf#listen(opts)');
    }
    this.dialogs = new Map() ;

    if (typeof app === 'function') {
      this._app = app ;
    }
    else {
      this._app = drachtio() ;
      ['connect', 'listening', 'reconnecting', 'error', 'close'].forEach((evt) => {
        this._app.on(evt, (...args) => { setImmediate(() => { this.emit(evt, ...args);});});
      }) ;

      if (typeof app === 'object') {
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

  /*
   * drachtio middleware that enables Dialog handling
   * @param  {Object} opts - configuration arguments, if any (currently unused)
   */
  dialog(opts) {
    opts = opts || {} ;

    return (req, res, next) => {

      debug('examining %s, dialog id: ', req.method, req.stackDialogId);
      if (req.stackDialogId && this.dialogs.has(req.stackDialogId)) {
        debug('calling dialog handler');
        this.dialogs.get(req.stackDialogId).handle(req, res, next) ;
        return ;
      }
      req.srf = res.srf = this;
      next() ;
    } ;
  }

  /**
   * process an incoming INVITE or SUBSCRIBE as a UAS (user agent server)
   * @param  {Request} req drachtio request object
   * @param  {Response} res drachtio response object
   * @param  {Srf~uasOptions} [opts] configuration options
   * @param  {Srf~uasCallback} [callback] optional callback
   * @return {Promise} if no callback is supplied, a Promise is returned that resolves with the dialog created;
   * otherwise the function returns a reference to the Srf instance
   */
  createUAS(req, res, opts = {}, callback) {
    opts.headers = opts.headers || {} ;
    const body = opts.body || opts.localSdp;
    const generateSdp = typeof body === 'function' ?
      opts.localSdp : () => { return Promise.resolve(opts.localSdp); };

    const __fail = (callback, err) => {
      callback(err);
    };

    const __send = (callback, content) => {
      let called = false;
      req.on('cancel', () => {
        req.canceled = called = true ;
        callback(new SipError(487, 'Request Terminated')) ;
      }) ;

      return res.send(req.method === 'INVITE'  ? 200 : 202, {
        headers: opts.headers,
        body: content
      }, (err, response) => {
        if (err) {
          if (!called) {
            called = true;
            callback(err);
          }
          return;
        }

        // note: we used to invoke callback after ACK was received
        // now we send it at the time we send the 200 OK
        // this is in keeping with the RFC 3261 spec
        const dialog = new Dialog(this, 'uas', {req: req, res: res, sent: response}) ;
        this.addDialog(dialog);
        callback(null, dialog);

        if ('INVITE' === req.method) {
          dialog.once('ack', () => {
            // should we emit some sort of event?
          }) ;
        }
        else {
          callback(null, dialog) ;
        }
      });
    };

    const __x = (callback) => {
      const send = __send.bind(this, callback);
      const fail = __fail.bind(this, callback);
      generateSdp()
        .then(send)
        .catch(fail);
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
  * create a UAC (user agent client)
  *
  * @param  {string}   uri -  request uri to send to
  * @param  {Srf~uacOptions}   opts   configuration options
  * @param  {Srf~uacProgressCallbacks} [progressCallbacks] contains callbacks with call progress info
  * @param  {Srf~uacCallback} [callback] optional callback
   * @return {Promise} if no callback is supplied, a Promise is returned that resolves with the dialog created;
   * otherwise the function returns a reference to the Srf instance
  */
  createUAC(uri, opts, cbRequest, cbProvisional, callback) {
    if (typeof uri === 'object') {
      callback = cbProvisional ;
      cbProvisional = cbRequest ;
      cbRequest = opts ;
      opts = uri ;
    }
    else {
      opts.uri = uri ;
    }

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
        if (-1 === opts.uri.indexOf('@') && 0 !== opts.uri.indexOf('sip')) {
          var address = opts.uri ;
          opts.uri = 'sip:' + (opts.calledNumber ? opts.calledNumber + '@' : '') + address ;
        }
        else if (0 !== opts.uri.indexOf('sip')) {
          opts.uri = 'sip:' + opts.uri ;
        }
      }

      if (opts.callingNumber) {
        opts.headers.from = 'sip:' + opts.callingNumber + '@localhost' ;
        opts.headers.contact = 'sip:' + opts.callingNumber + '@localhost' ;
      }

      const is3pcc = !opts.localSdp && 'INVITE' === method ;

      this._app.request({
        uri: opts.uri,
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
        cbRequest(null, req) ;

        req.on('response', (res, ack) => {
          if (res.status < 200) {
            cbProvisional(res) ;
            if (res.has('RSeq')) {
              ack() ; // send PRACK
            }
          }
          else {
            if (is3pcc && 200 === res.status && !!res.body) {

              if (opts.noAck === true) {

                // caller is responsible for invoking ack function with sdp they want to offer
                return callback(null, {
                  sdp: res.body,
                  ack: (localSdp, callback) => {
                    return new Promise((resolve, reject) => {
                      ack({body: localSdp}) ;

                      var dialog = new Dialog(this, 'uac', {req: req, res: res}) ;
                      dialog.local.sdp = localSdp ;
                      this.addDialog(dialog) ;
                      resolve(dialog) ;
                    });
                  }
                });
              }
              var bhSdp = res.body.replace(/c=IN\s+IP4\s+(\d+\.\d+\.\d+\.\d+)/, function(/* match, p1 */) {
                return 'c=IN IP4 0.0.0.0' ;
              }) ;
              bhSdp = bhSdp.replace(/(o=[a-zA-Z0-9]+\s+\d+\s+\d+\s+IN\s+IP4\s+)(\d+\.\d+\.\d+\.\d+)/,
                (match, p1) => { return p1 + '0.0.0.0' ;}
              ) ;
              ack({
                body: bhSdp
              }) ;
            }
            else if (method === 'INVITE') {
              ack() ;
            }

            if ((200 === res.status && method === 'INVITE') ||
                ((202 === res.status || 200 === res.status) && method === 'SUBSCRIBE')) {
              var dialog = new Dialog(this, 'uac', {req: req, res: res}) ;
              this.addDialog(dialog) ;
              return callback(null, dialog) ;
            }
            var error = new SipError(res.status, res.reason) ;
            error.res = res ;
            callback(error) ;
          }
        }) ;
      }) ;
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
  * create back-to-back dialogs; i.e. act as a back-to-back user agent
  * @param  {Request}   req  - incoming drachtio Request object, received in app.invite(...) method
  * @param  {Response}   res  - drachtio Response passed with incoming request
  * @param  {String}  uri - an IP address[:port] to send the B leg to
  * @param  {Srf~b2bOptions}  [opts] -   configuration options
  * @param  {Srf~b2bProgressCallbacks} [progresssCallbacks] contains callbacks with call progress info
  * @param  {Srf~b2bCallback} [callback] optional callback
  * @return {Promise} if no callback is supplied, a Promise is returned that resolves with the two dialogs created -
  * {uas, uac}; otherwise the function returns a reference to the Srf instance
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
    const propogateFailure = !(opts.passFailure === false);

    // default From, To, and user part of uri if not provided
    opts.headers = opts.headers || {} ;

    // pass specified headers on to the B leg
    proxyRequestHeaders.forEach((hdr) => { if (req.has(hdr)) opts.headers[hdr] = req.get(hdr);}) ;

    if (!opts.headers.from && !opts.callingNumber) { opts.callingNumber = req.callingNumber; }
    if (!opts.headers.to && !opts.calledNumber) { opts.calledNumber = req.calledNumber; }

    opts.localSdp = opts.localSdpB || req.body ;

    let remoteSdpB, translatedRemoteSdpB ;

    /* returns a Promise that resolves with the sdp to use responding to the A leg */
    function generateSdpA(res) {
      debug('createB2BUA: generateSdpA');

      const sdpB = res.body ;
      if (res.getParsedHeader('CSeq').method === 'SUBSCRIBE' || !sdpB) {
        return Promise.resolve(sdpB) ;
      }

      if (remoteSdpB && remoteSdpB === sdpB) {
        // called again with same remote SDP, return previous result
        return Promise.resolve(translatedRemoteSdpB) ;
      }

      remoteSdpB = sdpB ;
      if (!opts.localSdpA) {
        // passthru B leg SDP
        return Promise.resolve(translatedRemoteSdpB = sdpB);
      }
      else if ('function' === typeof opts.localSdpA) {
        // call function that resolves a new SDP based on B leg SDP
        return opts.localSdpA(sdpB, res)
          .then((sdpA) => {
            return translatedRemoteSdpB = sdpA ;
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }
      else {
        // insert provided SDP
        return Promise.resolve(translatedRemoteSdpB = opts.localSdpA) ;
      }
    }

    /* uac request sent, set handler to propogate CANCEL from A leg if we get it */
    function handleUACSent(err, uacReq) {
      if (err) {
        debug(`createB2BUA: Error sending uac request: ${err}`);
        res.send(500);
      }
      else {
        req.on('cancel', () => {
          res.send(487) ;
          uacReq.cancel() ;
        });
      }
      cbRequest(err, uacReq);
    }

    /* get headers from response on uac (B) leg and ready them for inclusion on our response on uas (A) leg */
    function copyUACHeadersToUAS(uacRes) {
      const headers = {} ;
      proxyResponseHeaders.forEach((hdr) => {
        debug(`copyUACHeadersToUAS: hdr ${hdr}`);
        if (uacRes.has(hdr)) {
          debug(`copyUACHeadersToUAS: adding ${hdr}: uacRes.get(hdr)`);
          headers[hdr] = uacRes.get(hdr) ;
        }
      }) ;
      debug(`copyUACHeadersToUAS: ${JSON.stringify(headers)}`);
      return headers ;
    }

    /* propogate any provisional responses from uac (B) leg to uas (A) leg */
    function handleUACProvisionalResponse(provisionalRes, uacReq) {
      if (provisionalRes.status > 101) {
        debug('Srf#createB2BUA: received a provisional response %d', provisionalRes.status) ;

        const opts = { headers: copyUACHeadersToUAS(provisionalRes) } ;

        if (provisionalRes.body) {
          generateSdpA(provisionalRes)
            .then((sdpA) => {
              opts.body = sdpA ;
              return res.send(provisionalRes.status, provisionalRes.reason, opts) ;
            })
            .catch((err) => {
              console.error(`Srf#createB2BUA: failed in call to produceSdpForALeg: ${err.message}`);
              res.send(500) ;
              uacReq.cancel() ;
            });
        }
        else {
          res.send(provisionalRes.status, provisionalRes.reason, opts) ;
        }
      }
      cbProvisional(provisionalRes);
    }

    const __x = (callback) => {
      debug(`createB2BUA: creating UAC, opts: ${JSON.stringify(opts)}`);

      opts._socket = req.socket ;

      this.createUAC(opts, {cbRequest: handleUACSent, cbProvisional: handleUACProvisionalResponse})
        .then((uac) => {

          //success establishing uac (B) leg, now establish uas (A) leg
          debug('createB2BUA: successfully created UAC..');

          cbFinalizedUac(uac);

          return this.createUAS(req, res, {
            headers:  copyUACHeadersToUAS(uac.res),
            localSdp: generateSdpA.bind(null, uac.res)
          })
            .then((uas) => {
              debug('createB2BUA: successfully created UAS..done!');
              callback(null, {uac, uas});  // successfully connected!  resolve promise with both dialogs
            })
            .catch((err) => {
              debug('createB2BUA: failed creating UAS..done!');
              uac.destroy() ;       // failed A leg after success on B: tear down B
              callback(err) ;
            });
        })
        .catch((err) => {
          debug(`createB2BUA: received non-success ${err.status || err} on uac leg`);
          const opts = {headers: copyUACHeadersToUAS(err.res)} ;
          if (propogateFailure) {
            res.send(err.status, opts) ;    // failed B: propogate failure to A
          }
          callback(err);
        });
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
  * respond to an incoming INVITE message by creating a user-agent server (UAS) dialog
  * @deprecated please use [createUAS]{@link Srf#createUAS} instead
  * @param  {Request}   req    incoming drachtio Request object, received in app.invite(...) method
  * @param  {Response}  res    drachtio Response passed with incoming request
  * @param  {Srf~uasOptions}    opts   configuration options
  * @param {Srf~dialogCreationCallback} cb      callback that provides the created Dialog
  */
  createUasDialog(req, res, opts, cb) {
    deprecate('please consider migrating to createUAS, the promises-based version');

    assert.ok(!!req.msg, 'argument \'req\' must be a drachtio Request') ;
    assert.equal(typeof res.agent, 'object', 'argument \'res\' must be a drachtio Response') ;
    assert.equal(typeof opts, 'object', 'argument \'opts\' must be provided with connection options') ;
    if (req.method === 'INVITE') {
      assert.equal(typeof opts.localSdp, 'string', 'argument \'opts.localSdp\' was not provided') ;
    }
    assert.equal(typeof cb, 'function', 'a callback function is required');

    opts.headers = opts.headers || {} ;

    res.send(req.method === 'INVITE'  ? 200 : 202, {
      headers: opts.headers,
      body: opts.localSdp
    }, (err, response) => {
      if (err) { return cb(err) ; }

      var dialog = new Dialog(this, 'uas', {req: req, res: res, sent: response}) ;
      this.addDialog(dialog);

      if (req.method === 'INVITE') {
        dialog.once('ack', () => {
          cb(null, dialog) ;
        }) ;
      }
      else {
        cb(null, dialog) ;
      }
    });

    req.on('cancel', () => {
      debug('Srf#createUasDialog: received CANCEL from uac') ;
      cb(new SipError(487, 'Request Terminated')) ;
    }) ;
  }

  /**
  * create a user-agent client (UAC) dialog by generating an INVITE request
  * @deprecated please use [createUAC]{@link Srf#createUAC} instead
  * @param  {RequestUri}   uri -  request uri to send to
  * @param  {Srf~uacOptions}   opts   configuration options
  * @param {Srf~dialogCreationCallback} cb      callback that provides the created Dialog
  * @param {Srf~provisionalResponseCallback} [cbProvisional]  callback that passes on provisional responses
  * @returns {Promise} promise fulfilled with the request that is actually sent over the wire
  */
  createUacDialog(uri, opts, cb, cbProvisional) {
    deprecate('please consider migrating to createUAC, the promises-based version');

    return new Promise((resolve, reject) => {
      const method = opts.method || 'INVITE' ;

      if (typeof uri === 'string') { opts.uri = uri ;}
      else if (typeof uri === 'object') {
        cbProvisional = cb ;
        cb = opts ;
        opts = uri ;
      }
      opts.headers = opts.headers || {} ;

      assert.ok(method === 'INVITE' || method === 'SUBSCRIBE', 'method must be either INVITE or SUBSCRIBE') ;
      assert.ok(!!opts.uri, 'uri must be specified') ;
      assert.equal(typeof cb, 'function', 'a callback function is required') ;

      var parsed = parser.parseUri(opts.uri) ;
      if (!parsed) {
        if (-1 === opts.uri.indexOf('@') && 0 !== opts.uri.indexOf('sip')) {
          var address = opts.uri ;
          opts.uri = 'sip:' + (opts.calledNumber ? opts.calledNumber + '@' : '') + address ;
        }
        else if (0 !== opts.uri.indexOf('sip')) {
          opts.uri = 'sip:' + opts.uri ;
        }
      }

      if (opts.callingNumber) {
        opts.headers.from = 'sip:' + opts.callingNumber + '@localhost' ;
        opts.headers.contact = 'sip:' + opts.callingNumber + '@localhost' ;
      }

      var is3pcc = !opts.localSdp && 'INVITE' === method ;


      this._app.request({
        uri: opts.uri,
        method: method,
        headers: opts.headers,
        body: opts.localSdp,
        auth: opts.auth
      },
      (err, req) => {
        if (err) {
          reject(err) ;
          return cb(err) ;
        }
        resolve(req) ;
        req.on('response', (res, ack) => {
          if (res.status < 200) {
            if (res.has('RSeq')) {
              ack() ; // send PRACK
            }
            if (cbProvisional) {
              cbProvisional(res) ;
            }
          }
          else {
            if (is3pcc && 200 === res.status && !!res.body) {

              if (opts.noAck === true) {
                // caller is responsible for sending ACK
                return cb(null, res.body, function(localSdp, callback) {
                  ack({body: localSdp}) ;

                  var dialog = new Dialog(this, 'uac', {req: req, res: res}) ;
                  dialog.local.sdp = localSdp ;
                  this.addDialog(dialog) ;
                  callback(null, dialog) ;
                }.bind(this));
              }
              var bhSdp = res.body.replace(/c=IN\s+IP4\s+(\d+\.\d+\.\d+\.\d+)/, function(/* match, p1 */) {
                return 'c=IN IP4 0.0.0.0' ;
              }) ;
              bhSdp = bhSdp.replace(/(o=[a-zA-Z0-9]+\s+\d+\s+\d+\s+IN\s+IP4\s+)(\d+\.\d+\.\d+\.\d+)/,
                (match, p1) => { return p1 + '0.0.0.0' ;}
              ) ;
              ack({
                body: bhSdp
              }) ;
            }
            else if (method === 'INVITE') {
              ack() ;
            }

            if ((200 === res.status && method === 'INVITE') ||
                ((202 === res.status || 200 === res.status) && method === 'SUBSCRIBE')) {

              var dialog = new Dialog(this, 'uac', {req: req, res: res}) ;
              this.addDialog(dialog) ;
              return cb(null, dialog) ;
            }
            var error = new SipError(res.status, res.reason) ;
            error.res = res ;
            cb(error) ;
          }
        }) ;
      }) ;
    });
  }

  /**
  * create back-to-back dialogs; i.e. act as a back-to-back user agent
  * @deprecated please use [createB2BUA]{@link Srf#createB2BUA} instead
  * @param  {Request}   req  - incoming drachtio Request object, received in app.invite(...) method
  * @param  {Response}   res  - drachtio Response passed with incoming request
  * @param  {String|Array}  uri] - an IP address[:port], or list of same, to send the B leg to
  * @param  {Srf~b2bOptions}  [opts] -   configuration options
  * @param  {Srf~b2bDialogCreationCallback} cb - callback invoked when operation is completed
  * @returns {Promise} promise fulfilled with the uac request that is actually sent over the wire
  */
  createBackToBackDialogs(req, res, uri, opts, cb) {
    deprecate('please consider migrating to createB2BUA, the promises-based version');

    assert.ok(typeof uri === 'string' || Array.isArray(uri), 'argument \'uri\' must be either a string or an array') ;

    if (typeof opts === 'function') {
      cb = opts ;
      opts = {} ;
    }

    assert.ok(!opts.onProvisional ||
      typeof opts.onProvisional === 'function', 'argument \'opts.onProvisional\' must be a function') ;

    let remoteSdpB, translatedRemoteSdpB ;

    function produceSdpForALeg(sdpB, res, callback) {
      const method = res.getParsedHeader('CSeq').method ;

      if (method === 'SUBSCRIBE' || !sdpB) {
        // no-op
        return callback(null, sdpB) ;
      }

      if (remoteSdpB && remoteSdpB === sdpB) {
        // called again with same remote SDP, return previous result
        return callback(null, translatedRemoteSdpB) ;
      }

      remoteSdpB = sdpB ;
      if (!opts.localSdpA) {
        // no-op: caller does not want to do any substitution
        callback(null, translatedRemoteSdpB = sdpB) ;
      }
      else if ('function' === typeof opts.localSdpA) {
        // invoke provided callback to generate SDP
        opts.localSdpA(sdpB, res, (err, sdp) => {
          callback(err, translatedRemoteSdpB = sdp);
        }) ;
      }
      else {
        // insert provided SDP
        callback(null, translatedRemoteSdpB = opts.localSdpA) ;
      }
    }

    opts.method = req.method ;
    var onProvisional = opts.onProvisional ;

    var proxyRequestHeaders = opts.proxyRequestHeaders || [] ;
    var proxyResponseHeaders = opts.proxyResponseHeaders || [] ;

    // default From, To, and user part of uri if not provided
    opts.headers = opts.headers || {} ;

    // pass specified headers on to the B leg
    proxyRequestHeaders.forEach((hdr) => {
      if (req.has(hdr)) {
        opts.headers[hdr] = req.get(hdr) ;
      }
    }) ;
    /*
    opts.headers.forEach(opts.headers, (value, hdr) => {
      opts.headers[hdr] = value ;
    }) ;
    */
    if (!opts.headers.from && !opts.callingNumber) { opts.callingNumber = req.callingNumber; }
    if (!opts.headers.to && !opts.calledNumber) { opts.calledNumber = req.calledNumber; }

    opts.localSdp = opts.localSdpB || req.body ;

    uri = 'string' === typeof uri ? [uri] : uri ;

    var finalUacFail ;
    var finalUacSuccess ;
    var receivedProvisional = false ;
    var canceled = false ;
    var uacBye, reqImmediateNotify, resImmediateNotify ;
    var uacPromise ;

    // DH: NOTE (possible TODO): callback signature changes in async 2.x for detectXXX
    async.detectSeries(

      // list of remote URIs to iterate
      uri,

      // truth test
      (uri, callback) => {

        if (receivedProvisional || canceled) {
          // stop cranking back once we receive a provisional > 100 from somebody or the caller canceled
          return callback(false);
        }

        // launch the next INVITE or SUBSCRIBE
        debug('sending %s to %s', opts.method, uri) ;
        uacPromise = this.createUacDialog(uri, opts,
          (err, uacDialog) => {
            if (err) {
              //non-success: crank back to the next uri if we have one
              finalUacFail = err ;
              debug('got failure %d', err.status) ;
              return callback(false) ;
            }

            // success - we're done
            debug('got success! ') ;
            finalUacSuccess = uacDialog ;

            // for invites, we need to handle a very quick hangup coming before we establish the uas dialog
            uacDialog.on('destroy', (msg) => {
              debug('Srf#createBackToBackDialogs: got a BYE on B leg before A leg has ACK\'ed') ;
              uacBye = msg ;
            }) ;

            //for subscribes, we need to handle the immediate notify that may come back
            //from the B leg before we establish the uas dialog
            if (uacDialog.dialogType === 'SUBSCRIBE') {
              uacDialog.on('notify', function(reqNotify, resNotify) {
                debug('Srf#createBackToBackDialogs: received immediate NOTIFY after SUBSCRIBE, ' +
                  'queueing until we complete A leg dialog') ;
                reqImmediateNotify = reqNotify ;
                resImmediateNotify = resNotify ;
              }) ;
            }
            callback(true) ;
          },
          (provisionalRes) => {
            if (provisionalRes.status > 100) {
              debug('Srf#createBackToBackDialogs: received a provisional response %d', provisionalRes.status) ;

              const opts = { headers: {} } ;
              proxyResponseHeaders.forEach((hdr) => {
                if (provisionalRes.has(hdr)) { opts.headers[hdr] = provisionalRes.get(hdr) ; }
              }) ;

              if (provisionalRes.body) {
                produceSdpForALeg(provisionalRes.body, provisionalRes, (err, sdp) => {
                  if (err) {
                    console.error(`Srf#createBackToBackDialogs: failed in call to produceSdpForALeg; ' + 
                      'terminate dialog: ${err.message}`) ;

                    //TODO: now we have to hang up B and return a 503 or something to A
                  }
                  opts.body = sdp ;
                  res.send(provisionalRes.status, provisionalRes.reason, opts) ;
                }) ;
              }
              else {
                res.send(provisionalRes.status, provisionalRes.reason, opts) ;
              }

              if (onProvisional) {
                onProvisional(provisionalRes) ;
              }
              // we're committed to this uac now
              receivedProvisional = true ;
            }
          }
        ) ;
        uacPromise.then((uacRequest) => {
          req.on('cancel', () => {
            debug('Srf#createBackToBackDialogs: received CANCEL as uas; sending CANCEL as uac') ;
            canceled = true ;
            finalUacFail = new SipError(487, 'Request Terminated') ;
            uacRequest.cancel() ;
          }) ;
        }) ;
      },

      // final handler
      (successUri) => {
        const opts = { headers: {} } ;
        if (typeof successUri === 'undefined') {
          // all failed, send the final failure response back
          // (TODO: should we be tracking the "best" failure to return?)

          // pass specified headers back to the A leg
          if (!finalUacFail.res) {
            res.send(503);
          }
          else {
            proxyResponseHeaders.forEach((hdr) => {
              if (finalUacFail.res.has(hdr)) { opts.headers[hdr] = finalUacFail.res.get(hdr) ; } }) ;
            res.send(finalUacFail.status, finalUacFail.reason, opts) ;
          }
          return cb(finalUacFail) ;
        }

        // success
        proxyResponseHeaders.forEach((hdr) => {
          if (finalUacSuccess.res.has(hdr)) {
            opts.headers[hdr] = finalUacSuccess.res.get(hdr) ;
          }
        }) ;
        produceSdpForALeg(finalUacSuccess.remote.sdp, finalUacSuccess.res, (err, sdp) => {
          opts.localSdp = sdp ;

          // pass specified headers back to the A leg
          this.createUasDialog(req, res, opts, (err, uasDialog) => {
            if (err) {
              return cb(err);
            }

            finalUacSuccess.removeAllListeners('destroy') ;

            // if B leg has already hung up, emit destroy event after caller has a chance to set up handlers
            if (uacBye) {
              setImmediate(() => {
                finalUacSuccess.emit('destroy', uacBye) ;
              }) ;
            }

            // for subscribe dialogs, stitch together the two dialogs
            // so that we automatically forward NOTIFY and SUBSCRIBE requests down the other leg
            // note: we don't currently do this for invite dialogs because it is trickier
            // to know how the app wants to handle re-invites
            if (uasDialog.dialogType === 'SUBSCRIBE') {

              // remove listener for early / immediate notify and handle any such queued requests
              finalUacSuccess.removeAllListeners('notify') ;
              if (reqImmediateNotify) {
                setImmediate(() => {
                  debug('Srf#createBackToBackDialogs: processing immediate notify') ;
                  this._b2bRequestWithinDialog(uasDialog, reqImmediateNotify, resImmediateNotify,
                    ['Event', 'Subscription-State', 'Content-Type'], []) ;
                });
              }

              // notify requests come from the B leg
              finalUacSuccess.on('notify', (req, res) => {
                this._b2bRequestWithinDialog(uasDialog, req, res, ['Event', 'Subscription-State', 'Content-Type'], []) ;
              }) ;

              // subscribes (to refresh or terminate) come from the A leg
              uasDialog.on('subscribe', (req, res) => {
                this._b2bRequestWithinDialog(finalUacSuccess, req, res, ['Event', 'Expires'],
                  ['Expires', 'Subscription-State', 'Allow-Events', 'Allow']) ;
              }) ;
            }

            cb(null, uasDialog, finalUacSuccess) ;
          }) ;
        }) ;
      }
    ) ;
    return uacPromise ;
  }

  /**
  * proxy an incoming request
  * @param  {Request}   req - drachtio request object representing an incoming SIP request
  * @param {String|Array} [destination] -  an IP address[:port], or list of same, to proxy the request to
  * @param  {Srf~proxyOptions}   [opts] - configuration options for the proxy operation
  * @param  {Srf~proxyCallback} [callback] - invoked when proxy operation is completed
  * @returns {Srf|Promise} returns a Promise if no callback is supplied, otherwise the Srf object
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

    debug(`Srf#proxyRequest opts ${JSON.stringify(opts)}, callback ${typeof callback}`);
    return req.proxy(opts, callback) ;
  }

  addDialog(dialog) {
    this.dialogs.set(dialog.id, dialog) ;
    debug('Srf#addDialog: adding dialog with id %s type %s, dialog count is now %d ',
      dialog.id, dialog.dialogType, this.dialogs.size) ;
  }

  removeDialog(dialog) {
    this.dialogs.delete(dialog.id) ;
    debug('Srf#removeDialog: removing dialog with id %s dialog count is now %d', dialog.id, this.dialogs.size) ;
  }

  _b2bRequestWithinDialog(dlg, req, res, proxyRequestHeaders, proxyResponseHeaders, callback) {
    callback = callback || noop ;
    var headers = {} ;
    proxyRequestHeaders.forEach((h) => {
      if (req.has(h)) { headers[h] = req.get(h); }
    }) ;
    dlg.request({
      method: req.method,
      headers: headers,
      body: req.body
    }, (err, response) => {
      headers = {} ;
      proxyResponseHeaders.forEach((h) => {
        if (!!response && response.has(h)) { headers[h] = response.get(h); }
      }) ;

      if (err) {
        debug('b2bRequestWithinDialog: error forwarding request: %s', err) ;
        res.send(response.status || 503, { headers: headers}) ;
        return callback(err) ;
      }
      var status = response.status ;

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
}

Srf.Dialog = Dialog ;
Srf.SipError = SipError ;
Srf.parseUri = parser.parseUri;

module.exports = exports = Srf ;

delegate(Srf.prototype, '_app')
  .method('connect')
  .method('listen')
  .method('endSession')
  .method('disconnect')
  .method('set')
  .method('get')
  .method('use')
  .method('request')
  .access('locals')
  .getter('idle') ;

methods.forEach((method) => {
  delegate(Srf.prototype, '_app').method(method.toLowerCase()) ;
}) ;


/**
 * This callback provides the dialog created in a createUAS request.
 * @callback Srf~uasCallback
 * @param {Error} err   error returned on non-success
 * @param {Dialog} dialog - User Agent Server dialog created
 */

/**
 * This callback provides the response to createBackToBackDialog request.
 * @callback Srf~b2bDialogCreationCallback
 * @param {Error} err   error returned on non-success
 * @param {Dialog} uasDialog - User Agent Server dialog (i.e., "A" leg)
 * @param {Dialog} uacDialog - User Agent Client dialog (i.e., "B" leg)
 */

/**
 * This callback provides the provisional responses received on the UAS leg when
 * issuing a createBackToBackDialog request.
 * @callback Srf~provisionalResponseCallback
 * @param  {Response}   res  - drachtio Response object
 */

/**
 * This callback provides the response to an api request.
 * @callback Srf~dialogCreationCallback
 * @param {Error} err   error returned on non-success
 * @param {Dialog} dialog Dialog object created on success
 */

/**
 * This callback provides the response to the proxy method
 * @callback Srf~proxyCallback
 * @param {Error} err   error returned on non-success
 * @param {Srf~proxyResults} results - description of the result of the proxy operation
 */


/**
 * Arguments provided when creating a UAS dialog
 * @typedef {Object} Srf~uasOptions
 * @property {Object=} headers SIP headers to include on the SIP response to the INVITE
 * @property {string} localSdp the local session description protocol to include in the SIP response
 */

/**
 * Arguments provided when creating a UAC dialog
 * @typedef {Object} Srf~uacOptions
 * @property {Object=} [headers] SIP headers to include on the SIP INVITE request
 * @property {string} localSdp the local session description protocol to include in the SIP INVITE request
 * @property {RequestUri=} [uri] request uri to send to
 */

/**
 * Callbacks providing call progress information for a UAC INVITE
 * @typedef {Object} Srf~uacProgressCallbacks
 * @property {Function} cbRequest - callback that provides request sent over the wire: cbRequest: (req) => {..}
 * @property {Function} cbProvisional - callback that provides a provisional response:
 * received cbProvisional: (req) => {..}
 */

/**
 * Arguments provided when creating a B2BUA
 * @typedef {Object} Srf~b2bOptions
 * @property {Object} [headers] SIP headers to include on the SIP INVITE request
 * @property {string|Function} [localSdpA] the local session description protocol
 * to offer in the response to the SIP INVITE request on the A leg; if a function is
 *  provided, the function is invoked to produce the SDP
 * @property {string} [localSdpB] the local session description protocol to offer in the SIP INVITE request on the B leg
 * @property {Array} [proxyRequestHeaders] an array of header names which, if they appear in the INVITE request
 * on the A leg, should be included unchanged on the generated B leg INVITE
 * @property {Array} [proxyResponseHeaders] an array of header names which, if they appear
 * in the response to the outgoing INVITE, should be included unchanged on the generated response to the A leg
 * @property {Srf~provisionalCallback} [onProvisional] a callback that is invoked when a
 * provisional response is received from the B leg
 * @property {string} provisionalTimeout - timeout after which to attempt next uri in the destination array (e.g '1s')
 * @property {boolean} [passFailure=true] - if non-success response from B leg, pass it on to the A leg
 */

/**
 * Callbacks providing call progress information for a B2BUA
 * @typedef {Object} Srf~b2bProgressCallbacks
 * @property {Function} cbRequest - callback that provides request sent over the wire: cbRequest: (req) => {..}
 * @property {Function} cbProvisional - callback that provides a provisional response:
 * received cbProvisional: (req) => {..}
 * @property {Function} cbFinalizedUac - callback that provides the finalized UAC dialog as soon as a 200 OK
 * is received from the B leg, and before the 200 OK is sent on the A leg: cbFinalizedUac: (uac) => {..}
 * An application should only supply this callback if there is a need to have access to the uac object before
 * both legs are established (i.e. typically, an application will simply wait to get both the uac and uas objects
 * when the returned Promise from the method fulfills.
 */

/**
 * Arguments provided when proxying an incoming request
 * @typedef {Object} Srf~proxyOptions
 * @property {String} [forking=sequential] - when multiple destinations are provided,
 * this option governs whether they are attempted sequentially or in parallel.
 * Valid values are 'sequential' or 'parallel'
 * @property {Boolean} [remainInDialog=false] - if true, add Record-Route header and
 * remain in the SIP dialog (i.e. receiving futher SIP messaging for the dialog, including the terminating BYE request)
 * @property {String} [provisionalTimeout] - timeout after which to attempt the next destination
 * if no 100 Trying response has been received.  Examples of valid syntax for this property is '1500ms', or '2s'
 * @property {String} [finalTimeout] - timeout, in milliseconds, after which to cancel
 * the current request and attempt the next destination if no final response has been received.
 * Syntax is the same as for the provisionalTimeout property.
 * @property {Boolean} [followRedirects=false] - if true, handle 3XX redirect responses by
 * generating a new request as per the Contact header; otherwise, proxy the 3XX response
 * back upstream without generating a new response
 */

/**
 * Arguments provided when proxying an incoming request
 * @typedef {Object} Srf~proxyResults
 * @property {Boolean} connected - indicates whether the request was successfully connected to one of the destinations
 * @property {Srf~proxyResponse[]} responses - array of responses received from destination endpoints
*/
/**
 * Detailed information describing the responses received from one proxy destination
 * @typedef {Object} Srf~proxyResponse
 * @property {string} address - destination SIP signaling address that generated the response
 * @property {Number} port - destination SIP signaling port that generated the response
 * @property {Srf~proxyResponseMsg[]} msgs - array of SIP messages received from the
 * destination in response to the proxy request
 * */
/**
 * Detailed information describing a single SIP response message received from one specific proxy attempt
 * @typedef {Object} Srf~proxyResponseMsg
 * @property {String} time - the time (UTC) at which the SIP stack received the response
 * @property {Number} status - the SIP status of the response
 * @property {Object} msg - the full SIP message received
*/
/** send a SIP request outside of a dialog
*   @name Srf#request
*   @method
*   @param  {string} uri - sip request-uri to send request to
*   @param {Srf~requestOptions} [opts] - configuration options
*   @param  {Srf~requestCallback} [cb] - callback invoked when operation has completed
*/
/**
 * Arguments provided when sending a request outside of a dialog
 * @typedef {Object} Srf~requestOptions
 * @property {String} method - SIP method to send (lower-case)
 * @property {Object} [headers] - SIP headers to apply to the outbound request
 * @property {String} [body] - body to send with the SIP request
*/
/**
 * This callback provides the response to the request method
 * @callback Srf~requestCallback
 * @param {Error} err   error returned on non-success
 * @param {Request} req - drachtio request that was sent. Note: you will typically
 * want to call "req.on('response', function(res){..}"" in order to handle responses from the far end.
 */
/** connect to drachtio server
*   @name Srf#connect
*   @method
*   @param  {string} [host='localhost'] - address drachtio server is listening on for client connections
*   @param  {Number} [port=9022] - address drachtio server is listening on for client connections
*   @param  {String} secret - shared secret used to authenticate connections
*   @param  {Srf~connectCallback} [cb] - callback invoked when operation has completed successfully
*/
/**
 * This callback provides the response to the connect method
 * @callback Srf~connectCallback
 * @param {String} hostport - the SIP address[:port] drachtio server is listening on for incoming SIP messages
 */
/**
 * a <code>connect</code> event is emitted by an Srf instance when a connect method completes
 * with either success or failure
 * @event Srf#connect
 * @param {Object} err - error encountered when attempting to connect
 * @param {String} hostport - the SIP address[:port] drachtio server is listening on for incoming SIP messages
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
