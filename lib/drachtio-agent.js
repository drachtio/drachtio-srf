const Emitter = require('events');
const debug = require('debug')('drachtio:agent');
const debugSocket = require('debug')('drachtio:socket');
const WireProtocol = require('./wire-protocol') ;
const SipMessage = require('drachtio-sip').SipMessage ;
const Request = require('./request') ;
const Response = require('./response') ;
const DigestClient = require('./digest-client') ;
const noop = require('node-noop').noop;
const winston = require('winston') ;
const assert = require('assert');
const net = require('net');
const delegate = require('delegates') ;
const tls = require('tls');
const CR = '\r' ;
const CRLF = '\r\n' ;

const defer = typeof setImmediate === 'function' ?
  setImmediate : function(fn) { process.nextTick(fn.bind.apply(fn, arguments)); } ;

function typeSocket(socket) {
  return socket instanceof net.Socket || socket instanceof tls.TLSSocket;
}
function sockPort(socket) {
  assert(typeSocket(socket));
  return '' + socket.remotePort + ':' + socket.localPort;
}

class DrachtioAgent extends Emitter {

  constructor(callback) {
    super();

    this.puntUpTheMiddleware = callback ;
    this.params = new Map() ;

    this.mapServer = new Map() ;
    this.verbs = new Map() ;
    this.cdrHandlers = new Map() ;

    //map of stack transaction ids => pending requests, where txn id for request has been challenged
    this.pendingSipAuthTxnIdUpdate = new Map(),


    this._listen = false;
  }

  get isListening() {
    return this._listen;
  }
  get idle() {

    let pendingCount = 0 ;
    let pendingSipCount = 0 ;
    let pendingAckOrPrack = 0 ;

    this.mapServer.forEach((obj, socket) => {
      pendingCount += obj.pendingRequests.size ;
      pendingSipCount += obj.pendingSipRequests.size ;
      pendingAckOrPrack += obj.pendingAckOrPrack.size ;

      if (pendingCount > 0) {
        debug(`count of pending requests: ${pendingCount}`) ;
        for (const key of obj.pendingRequests.keys()) {
          debug(key);
        }
      }
      if (pendingSipCount > 0) {
        debug(`count of pending sip requests: ${pendingSipCount}`) ;
        for (const key of obj.pendingSipRequests.keys()) {
          debug(key);
        }
      }
      if (pendingAckOrPrack > 0) {
        debug(`count of pending ack/prack: ${pendingAckOrPrack}`) ;
        for (const key of obj.pendingAckOrPrack.keys()) {
          debug(key);
        }
      }

    });

    debug(`idle check: ${pendingCount + pendingSipCount + pendingAckOrPrack}`);
    return (pendingCount + pendingSipCount + pendingAckOrPrack) === 0 ;
  }

  connect(opts, callback) {
    this.secret = opts.secret ;
    this.tags = opts.tags || [];

    if (this._logger) {
      opts.logger = this._logger ;
    }

    this.wp = new WireProtocol(opts) ;
    this.wp.connect(opts);

    // pass on some of the socket events
    ['reconnecting', 'close', 'error'].forEach((evt) => {
      this.wp.on(evt, (...args) => {
        this.emit(evt, ...args);
      }) ;
    }) ;

    this.wp.on('connect', this._onConnect.bind(this)) ;
    this.wp.on('close', this._onClose.bind(this));
    this.wp.on('msg', this._onMsg.bind(this)) ;

    if (callback) {
      Emitter.prototype.on.call(this, 'connect', callback);
    }
  }

  listen(opts, callback) {
    this.secret = opts.secret ;
    this.tags = opts.tags || [];

    if (this._logger) {
      opts.logger = this._logger ;
    }

    this._listen = true;
    this.wp = new WireProtocol(opts) ;
    const server = this.wp.listen(opts);

    delegate(this, 'wp')
      .method('close') ;


    // pass on some of the socket events
    ['reconnecting', 'close', 'error', 'listening'].forEach((evt) => {
      this.wp.on(evt, (...args) => {
        this.emit(evt, ...args);
      }) ;
    }) ;

    this.wp.on('connection', this._onConnect.bind(this)) ;
    this.wp.on('msg', this._onMsg.bind(this)) ;

    if (callback) {
      Emitter.prototype.on.call(this, 'listening', callback);
    }

    return server ;
  }

  on(event, fn) {

    //cdr events are handled through a different mechanism - we register with the server
    if (0 === event.indexOf('cdr:')) {
      this.cdrHandlers.set(event.slice(4), fn) ;
      this.route(event) ;
    }
    else {
      //delegate to EventEmitter
      Emitter.prototype.on.apply(this, arguments);
    }
    return this ;
  }

  sendMessage(socket, msg, opts) {
    if (!typeSocket(socket)) {
      opts = msg;
      msg = socket ;
      socket =  this._getDefaultSocket() ;
    }

    debug(`sendMessage: ${msg}`);
    let m = msg ;
    opts = opts || {} ;

    debug(`opts: ${JSON.stringify(opts)}`);

    if (opts && (opts.headers || opts.body)) {
      m = new SipMessage(msg) ;
      for (const hdr in (opts.headers || {})) {
        m.set(hdr, opts.headers[hdr]) ;
      }
      if (opts.body) { m.body = opts.body ; }
    }

    const s = `sip|${opts.stackTxnId || ''}|${opts.stackDialogId || ''}${CRLF}${m.toString()}`;

    return this.wp.send(socket, s) ;
  }

  _normalizeParams(socket, uri, options, callback) {
    if (!typeSocket(socket)) {
      callback = options ;
      options = uri ;
      uri = socket ;
      socket = null ;
    }

    if (typeof uri === 'undefined') {
      const err = new Error('undefined is not a valid request_uri or options object.') ;
      console.error(err.stack) ;
      throw err ;
    }

    // request( request_uri, options, callback, ..)
    if (options && typeof options === 'object') {
      options.uri = uri ;
    }
    // request( request_uri, callback, ..)
    else if (typeof uri === 'string') {
      options = {uri:uri } ;
    }
    // request( option, callback, ..)
    else {
      callback = options ;
      options = uri ;
      uri = options.uri;
    }
    callback = callback || noop ;

    if (options._socket) {
      debugSocket(`_normalizeParams: using socket provided in options._socket: ${sockPort(options._socket)}`);
      socket = options._socket ;
      delete options._socket ;
    }
    else {
      socket = this._getDefaultSocket() ;
      debugSocket(
        `_normalizeParams: using default socket provided in options._socket: ${sockPort(socket)}`);
    }

    debug(`options: ${JSON.stringify(options)}`);
    options.method = options.method.toUpperCase() ;

    return { socket, uri, options, callback } ;
  }

  _makeRequest(params) {
    debugSocket(`_makeRequest: there are ${this.mapServer.size} entries in mapServer`);
    const obj = this.mapServer.get(params.socket) ;

    //allow for requests within a dialog, where caller does not need to supply a uri
    if (!params.options.uri && !!params.options.stackDialogId) {
      params.options.uri = 'sip:placeholder' ;
    }

    const m = new SipMessage(params.options) ;

    //new outgoing request
    let msg = `sip|${params.options.stackTxnId || ''}|${params.options.stackDialogId || ''}`;
    if (params.options.proxy) {
      msg += `|${params.options.proxy}`;
    }
    msg += `${CRLF}${m.toString()}` ;

    debugSocket(`_makeRequest: calling wp.send using socket ${sockPort(params.socket)}`);
    assert.ok(typeSocket(params.socket), 'provided socket is not a net.Socket or tls.TLSSocket');
    assert.ok(params.socket.destroyed !== true, 'provided socket has been destroyed');

    const msgId = this.wp.send(params.socket, msg) ;

    obj.pendingRequests.set(msgId, (token, msg) => {
      if (token[0] === 'OK') {
        const transactionId = token[7] ;
        const meta = {
          source: token[1],
          address: token[4],
          port: token[5],
          protocol: token[3],
          time: token[6],
          transactionId: transactionId
        } ;

        const req = new Request(new SipMessage(msg), meta) ;
        req.agent = this ;
        req.socket = obj.socket ;
        if (params.options.auth) {
          req.auth = params.options.auth ;
          req._originalParams = params ;
        }

        //Note: unfortunately, sofia (the nta layer) does not pass up the 200 OK response to a CANCEL
        //so we are unable to route it up to the application.
        //Therefore, we can't allocate this callback since it would never be called or freed
        if (params.options.method !== 'CANCEL') {
          obj.pendingSipRequests.set(transactionId,  {
            req: req
          }) ;
        }

        params.callback(null, req) ;

      }
      else {
        params.callback(token[1] || 'request failed') ;
      }
    });
  }

  request(socket, request_uri, options, callback) {
    const params = this._normalizeParams(socket, request_uri, options, callback) ;

    // check for race condition where we are canceling an INVITE that just got challenged
    // (so the stackTxnId needs to be upgraded to the new INVITE w credentials we just sent)
    if (params.options && params.options.stackTxnId) {
      if (this.pendingSipAuthTxnIdUpdate.has(params.options.stackTxnId)) {
        debug(`uac-auth: holding ${params.options.method} for ${params.options.stackTxnId} that is being replaced`);
        this.pendingSipAuthTxnIdUpdate.set(params.options.stackTxnId, params);
        return;
      }
    }
    return this._makeRequest(params) ;
  }

  sendResponse(res, opts, callback, fnAck) {
    const obj = this.mapServer.get(res.socket) ;
    debug(`agent#sendResponse: ${JSON.stringify(res.msg)}`);
    const msgId = this.sendMessage(res.socket, res.msg, Object.assign({stackTxnId: res.req.stackTxnId}, opts)) ;
    if (callback || fnAck) {

      obj.pendingRequests.set(msgId, (token, msg, meta) => {
        obj.pendingRequests.delete(msgId) ;
        if ('OK' !== token[0]) { return callback(token[1]) ; }
        const responseMsg = new SipMessage(msg) ;
        res.meta = meta ;
        if (callback) {
          callback(null, responseMsg) ;
        }

        // for reliable provisional responses or does caller want to be notified on receipt of prack / ack ?
        if (fnAck && typeof fnAck === 'function' &&
          (responseMsg.has('RSeq') || res.status === 200)) {
          obj.pendingAckOrPrack.set(meta.dialogId, fnAck) ;
        }
      }) ;
    }
    if (res.statusCode >= 200) {
      defer(() => {
        res.finished = true ;
        res.emit('finish');
      });

      // clear out pending incoming INVITEs when we send a final response
      if (res.req.method === 'INVITE') {
        const callId = res.get('call-id') ;
        obj.pendingNetworkInvites.delete(callId) ;
        debug(`Agent#sendResponse: deleted pending invite for call-id ${callId}, ` +
          `there are now ${obj.pendingNetworkInvites.size} pending invites`);
      }
    }
  }

  sendAck(method, dialogId, req, res, opts, callback) {
    assert(this.mapServer.has(res.socket));
    const obj = this.mapServer.get(res.socket) ;
    const m = new SipMessage() ;
    m.method = method ;
    m.uri = req.uri ;
    opts = opts || {} ;

    Object.assign(opts, {stackDialogId: dialogId}) ;

    const msgId = this.sendMessage(res.socket, m, opts) ;
    if (callback) {
      obj.pendingRequests.set(msgId, (token, msg, meta) => {
        if ('OK' !== token[0]) {
          return callback(token[1]) ;
        }
        callback(null, new SipMessage(msg)) ;
      }) ;
    }
  }

  proxy(req, opts, callback) {
    const obj = this.mapServer.get(req.socket) ;

    const m = new SipMessage({
      uri: opts.destination[0],
      method: req.method
    }) ;

    if (opts.headers) {
      for (const hdr in (opts.headers || {})) {
        m.set(hdr, opts.headers[hdr]) ;
      }
    }

    const msg = `proxy|${opts.stackTxnId}|${(opts.remainInDialog ? 'remainInDialog' : '')}` +
    `|${(opts.fullResponse ? 'fullResponse' : '')}|${(opts.followRedirects ? 'followRedirects' : '')}` +
    `|${(opts.simultaneous ? 'simultaneous' : 'serial')}|${opts.provisionalTimeout}|${opts.finalTimeout}` +
    `|${opts.destination.join('|')}${CRLF}${m.toString()}` ;

    const msgId = this.wp.send(req.socket, msg) ;
    obj.pendingRequests.set(msgId, callback) ;
  }

  set(prop, val) {

    switch (prop) {
      case 'api logger':
        if (val) {
          const opts = {} ;
          opts['string' === typeof val ? 'filename' : 'stream'] = val ;

          const c = new winston.Container({
            transports: [
              new (winston.transports.File)(opts)
            ]
          }) ;
          this._logger = c.add('default').info ;

          if (this.wp) {
            this.wp.setLogger(this._logger) ;
          }
        }
        else {
          this._logger = null ;
          if (this.wp) {
            this.wp.removeLogger() ;
          }
        }
        break ;
      case 'handler':
        this.puntUpTheMiddleware = val ;
        break ;

      default:
        this.params.set(prop, val) ;
        break ;
    }
  }

  get(prop) {
    return this.params.get(prop) ;
  }

  route(verb) {
    if (this.verbs.has(verb)) { throw new Error('duplicate route request for ' + verb) ; }
    this.verbs.set(verb,  {sent: false }) ;

    this.mapServer.forEach((obj, socket) => {
      if (obj.authenticated) {
        this.routeVerbs(socket) ;
      }
    });
  }

  routeVerbs(socket) {
    this.verbs.forEach((obj, verb) => {
      if (obj.sent === true) {
        return ;
      }

      obj = {
        sent: true,
        acknowledged: false,
        rid: this.wp.send(socket, 'route|' + verb)
      } ;
    });
  }

  disconnect(socket) {
    const sock = socket || this._getDefaultSocket();
    debugSocket(`disconnect: removing socket ${sockPort(sock)}`);
    this.wp.disconnect(sock) ;
    if (socket) {
      this.mapServer.delete(socket);
      debugSocket(`disconnect: after delete there are ${this.mapServer.size} entries in mapServer`);
    }
  }
  close() {
    this.wp.close() ;
  }

  _getDefaultSocket() {
    debugSocket(`_getDefaultSocket: there are ${this.mapServer.size} entries in mapServer`);
    const socket = this.mapServer.keys().next().value ;
    debugSocket(`_getDefaultSocket: returning socket ${sockPort(socket)}`);
    return socket;
  }
  _initServer(socket) {
    assert(!this.mapServer.has(socket));
    this.mapServer.set(socket, {
      //any request message awaiting a response from a drachtio server
      pendingRequests: new Map(),
      //any sip request generated by us awaiting a final response from a drachtio server
      pendingSipRequests: new Map(),
      //any sip request generated by us that we are resending with Authorization header; key=call-id
      pendingSipAuthRequests: new Map(),
      //any sip INVITE we've received that we've not yet generated a final response for
      pendingNetworkInvites: new Map(),
      // a reliable provisional response or 200 OK to INVITE that is waiting on a PRACK/ACK
      pendingAckOrPrack: new Map(),
      authenticated: false,
      ready: false,
      hostport: null
    });
    debugSocket(`_initServer: added socket: ${sockPort(socket)}, count now: ${this.mapServer.size}`);
    return this.mapServer.get(socket);
  }

  _onConnect(socket) {
    const obj = this._initServer(socket) ;
    const msgId = this.wp.send(socket, `authenticate|${this.secret}|${this.tags.join(',')}`) ;
    obj.pendingRequests.set(msgId, (response) => {
      if (obj.authenticated = ('OK' === response[0])) {
        obj.ready = true ;
        obj.hostport = response[1] ;
        debug('sucessfully authenticated, hostport is ', obj.hostport) ;

        if (this.wp.isClient) {
          this.routeVerbs(socket, obj) ;
          setImmediate(() => {
            this.emit('connect', null, obj.hostport, socket);
          });
        }
        else {
          this.emit('connect', null, obj.hostport, socket);
        }
      }
      else {
        this.emit('connect', new Error('failed to authenticate to server')) ;
      }
    }) ;
  }
  _onClose(socket) {
    this.mapServer.delete(socket);
    debugSocket(`_initServer: removed socket: ${sockPort(socket)}, count now: ${this.mapServer.size}`);
  }

  _onMsg(socket, msg) {
    const obj = this.mapServer.get(socket) ;
    const pos = msg.indexOf(CR) ;
    const leader = -1 === pos ? msg : msg.slice(0, pos) ;
    const token = leader.split('|') ;
    let res, sr, rawMsg ;

    switch (token[1]) {
      case 'sip':
        if (!obj) {
          debug('socket not found, message discarding');
          return ;
        }
        rawMsg = msg.slice(pos + 2) ;
        const sipMsg = new SipMessage(rawMsg) ;
        const source = token[2] ;
        const protocol = token[4] ;
        const address = token[5] ;
        const port = token[6] ;
        const time = token[7] ;
        const transactionId = token[8] ;
        const dialogId = token[9] ;
        const meta = { source, address, port, protocol, time, transactionId, dialogId } ;
        debug(`tokens: ${JSON.stringify(token)}`);

        if (token.length > 9) {

          if ('network' === source && sipMsg.type === 'request') {

            //handle CANCELS by locating the associated INVITE and emitting a 'cancel' event
            const callId = sipMsg.get('call-id') ;
            if ('CANCEL' === sipMsg.method) {

              // hopefully, this pertains to an INVITE we have received earlier
              if (obj.pendingNetworkInvites.has(callId)) {
                obj.pendingNetworkInvites.get(callId).req.emit('cancel') ;
                obj.pendingNetworkInvites.delete(callId) ;
                debug(`Agent#handle - emitted cancel event for INVITE with call-id ${callId}` +
                  `, remaining count of invites in progress: ${obj.pendingNetworkInvites.size}`);
              }
              else {
                // if not, don't punt up the middleware because the drachtio server will have already
                // responded to the CANCEL and we dont want to send another 404 which is what would happen
                debug(`Agent#handle - got CANCEL for call-id ${callId} that was not found`);
              }
              return;
            }

            debug(`DrachtioAgent#_onMsg: meta: ${JSON.stringify(meta)}`);

            const req = new Request(sipMsg, meta) ;
            res = new Response() ;
            req.res = res ;
            res.req = req ;
            req.agent = res.agent = this ;
            req.socket = res.socket = socket ;

            if ('INVITE' === req.method) {
              obj.pendingNetworkInvites.set(callId, { req, res }) ;
              debug(`Agent#handle: tracking an incoming invite with call-id ${callId}, ` +
                `currently tracking ${obj.pendingNetworkInvites.size} invites in progress`);
            }
            else if (('PRACK' === req.method || 'ACK' === req.method) && obj.pendingAckOrPrack.has(dialogId)) {
              const fnAck = obj.pendingAckOrPrack.get(dialogId);
              obj.pendingAckOrPrack.delete(dialogId);
              fnAck() ;
            }

            this.puntUpTheMiddleware(req, res) ;
          }
          else if ('network' === source) {
            debug('received sip response');
            if (obj.pendingSipRequests.has(transactionId)) {
              sr = obj.pendingSipRequests.get(transactionId) ;
              res = new Response(this) ;
              res.msg = sipMsg ;
              res.meta = meta ;
              res.req = sr.req ;
              res.socket = res.req.socket = socket ;

              debug('Agent#handle: got a response with status: %d', res.status) ;

              if (res.status >= 200) {
                obj.pendingSipRequests.delete(transactionId)  ;
              }

              //prepare a function to be called for prack or ack, if appropriate
              let ack = noop ;
              if (res.status >= 200 && res.req.method === 'INVITE') {
                ack = Response.prototype.sendAck.bind(res, token[9]) ;
              }
              else if (res.status > 100 && res.status < 200) {
                const prackNeeded = res.get('RSeq');
                if (prackNeeded) {
                  ack = Response.prototype.sendPrack.bind(res, token[9]) ;
                }
              }
              // If its a challenge and the user supplied username and password, automatically handle it
              const cid = res.msg.headers['call-id'];
              if (obj.pendingSipAuthRequests.has(cid)) {
                obj.pendingSipAuthRequests.delete(cid) ;
                this.pendingSipAuthTxnIdUpdate.delete(res.req.stackTxnId);
              }
              else if ((401 === res.status || 407 === res.status) && (!!res.req.auth)) {
                obj.pendingSipAuthRequests.set(cid, true) ;
                this.pendingSipAuthTxnIdUpdate.set(res.req.stackTxnId, {});
                const client = new DigestClient(res) ;
                client.authenticate((err, req) => {
                  // move all listeners from the old request to the new one we just generated
                  res.req.listeners('response').forEach((l) => { req.on('response', l) ; }) ;
                  res.req.emit('authenticate', req) ;

                  //if we got a quick CANCEL before we got the new txn id, it was held and can now be sent
                  const params = this.pendingSipAuthTxnIdUpdate.get(res.req.stackTxnId);
                  if (params && params.options && params.options.stackTxnId) {
                    debug(
                      `uac-auth: sending out delayed ${params.options.method} originally for ${res.req.stackTxnId}`);
                    params.options.stackTxnId = req.stackTxnId;
                    this._makeRequest(params);
                  }
                  this.pendingSipAuthTxnIdUpdate.delete(res.req.stackTxnId);

                  // the app may still call req.cancel() on the old request, so make that work
                  debug(`uac-auth: new transaction ${req.stackTxnId} overwrites ${res.req.stackTxnId}`);
                  res.req.stackTxnId = req.stackTxnId;
                }) ;
                return ;
              }
              sr.req.emit('response', res, ack) ;
            }
          }
          else if ('application' === source && sipMsg.type === 'request' && transactionId === 'unsolicited') {
            debug('received unsolicited request sent from application; probably BYE due to ACK timeout or the like');
            const req = new Request(sipMsg, meta) ;
            res = new Response() ;
            req.res = res ;
            res.req = req ;
            req.agent = res.agent = this ;
            req.socket = res.socket = socket ;

            //stub out send
            res.send = noop;

            this.puntUpTheMiddleware(req, res);
          }
        }

        break ;

      case 'response':
        if (!obj) {
          debug('socket not found, message discarding');
          return ;
        }
        const rId = token[2] ;
        if (obj.pendingRequests.has(rId)) {
          if (-1 !== pos) { rawMsg = msg.slice(pos + 2) ; }
          const meta2 = {
            source: token[4],
            address: token[7],
            port: token[8],
            protocol: token[6],
            time: token[9],
            transactionId: token[10],
            dialogId: token[11]
          } ;
          const fn = obj.pendingRequests.get(rId).bind(this, token.slice(3), rawMsg, meta2) ;
          if ('continue' !== token[12]) {
            obj.pendingRequests.delete(rId) ;
          }
          fn() ;
        }
        break ;

      case 'cdr:attempt':
      case 'cdr:start':
      case 'cdr:stop':
        const cdrEvent = token[1].slice(4)  ;
        const msgSource = token[2] ;
        const msgTime = token[3] ;
        rawMsg = msg.slice(pos + 2) ;
        const cdrSipMsg = new SipMessage(rawMsg) ;
        const args = [msgSource, msgTime] ;
        if (cdrEvent !== 'attempt') { args.push(token[4]) ; }
        args.push(cdrSipMsg) ;

        if (this.cdrHandlers.has(cdrEvent)) {
          this.cdrHandlers.get(cdrEvent).apply(this, args) ;
        }
        break ;

      default:
        throw new Error('unexpected message with type: ' + token[1]) ;
    }
  }
}

DrachtioAgent.prototype.uac = DrachtioAgent.prototype.request ; // alias

module.exports = DrachtioAgent ;
