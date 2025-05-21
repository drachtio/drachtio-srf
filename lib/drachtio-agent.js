const Emitter = require('events');
const debug = require('debug')('drachtio:agent');
const debugSocket = require('debug')('drachtio:socket');
const WireProtocol = require('./wire-protocol') ;
const SipMessage = require('./sip-parser/message');
const Request = require('./request') ;
const Response = require('./response') ;
const DigestClient = require('./digest-client') ;
const noop = require('node-noop').noop;
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

function serverVersionAtLeast(serverVersion, minSupportedVersion) {
  if (process.env.NODE_ENV === 'test') return true;
  if (serverVersion) {
    try {
      const regex = /^v(\d+)\.(\d+)\.(\d+)/;
      const actual = regex.exec(serverVersion);
      if (actual) {
        const desired = regex.exec(minSupportedVersion);
        if (desired) {
          debug(`parsed serverVersion: ${JSON.stringify(actual)}, desired is ${JSON.stringify(desired)}`);
          if (parseInt(actual[1]) > parseInt(desired[1])) return true;
          if (parseInt(actual[1]) < parseInt(desired[1])) return false;
          if (parseInt(actual[2]) > parseInt(desired[2])) return true;
          if (parseInt(actual[2]) < parseInt(desired[2])) return false;
          if (parseInt(actual[3]) >= parseInt(desired[3])) return true;
        }
        else assert.ok(false, `failed parsing desired ${minSupportedVersion}`);
      }
      else assert.ok(false, `failed parsing actual ${serverVersion}, please fix`);
    } catch (err) {
      debug(`Error parsing server version: ${serverVersion}: %o`, err);
    }
  }
  return false;
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
    if (typeof opts !== 'object' || opts === null) {
      debug('DrachtioAgent#connect: Validation Error - opts must be an object.');
      throw new TypeError('opts parameter must be an object.');
    }
    if (typeof opts.secret !== 'string' || opts.secret.length === 0) {
      debug('DrachtioAgent#connect: Validation Error - opts.secret is required and must be a non-empty string.');
      throw new TypeError('opts.secret is required and must be a non-empty string.');
    }
    if (opts.tags && !Array.isArray(opts.tags)) {
      debug('DrachtioAgent#connect: Validation Error - opts.tags must be an array if provided.');
      throw new TypeError('opts.tags must be an array if provided.');
    }
    if (opts.tags && Array.isArray(opts.tags) && !opts.tags.every(tag => typeof tag === 'string')) {
      debug('DrachtioAgent#connect: Validation Error - all elements in opts.tags must be strings.');
      throw new TypeError('All elements in opts.tags must be strings.');
    }
    if (callback && typeof callback !== 'function') {
      debug('DrachtioAgent#connect: Validation Error - callback must be a function if provided.');
      throw new TypeError('callback must be a function if provided.');
    }

    this.secret = opts.secret ;
    this.tags = opts.tags || [];

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
    if (typeof opts !== 'object' || opts === null) {
      debug('DrachtioAgent#listen: Validation Error - opts must be an object.');
      throw new TypeError('opts parameter must be an object.');
    }
    if (typeof opts.secret !== 'string' || opts.secret.length === 0) {
      debug('DrachtioAgent#listen: Validation Error - opts.secret is required and must be a non-empty string.');
      throw new TypeError('opts.secret is required and must be a non-empty string.');
    }
    if (opts.tags && !Array.isArray(opts.tags)) {
      debug('DrachtioAgent#listen: Validation Error - opts.tags must be an array if provided.');
      throw new TypeError('opts.tags must be an array if provided.');
    }
    if (opts.tags && Array.isArray(opts.tags) && !opts.tags.every(tag => typeof tag === 'string')) {
      debug('DrachtioAgent#listen: Validation Error - all elements in opts.tags must be strings.');
      throw new TypeError('All elements in opts.tags must be strings.');
    }
    if (callback && typeof callback !== 'function') {
      debug('DrachtioAgent#listen: Validation Error - callback must be a function if provided.');
      throw new TypeError('callback must be a function if provided.');
    }

    this.secret = opts.secret ;
    this.tags = opts.tags || [];

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

    this.wp.on('close', this._onClose.bind(this));
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
    else if (event === 'ping') {
      const {msgId, socket} = fn;
      const obj = this.mapServer.get(socket);
      if (obj) {
        debug(`sent ping request with msgId ${msgId}`);
        obj.pendingPingRequests.add(msgId);
      }
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

    try {
      if (opts && (opts.headers || opts.body)) {
        m = new SipMessage(msg) ;
        for (const hdr in (opts.headers || {})) {
          m.set(hdr, opts.headers[hdr]) ;
        }
        if (opts.body) { m.body = opts.body ; }
      }
    } catch (err) {
      debug('DrachtioAgent#sendMessage: Error constructing SipMessage: %o', err);
      this.emit('error', new Error(`Error constructing SipMessage: ${err.message}`));
      // Not attempting to send callback(err) as sendMessage doesn't have a direct callback for this failure
      return;
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
      debug('DrachtioAgent#_normalizeParams: Validation Error - The first argument (uri or options) cannot be undefined.');
      throw new TypeError('The first argument (uri or options) to request() cannot be undefined.');
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

    if (typeof callback !== 'function') {
      // This case implies 'options' was actually the callback, and 'uri' was the options object.
      // Or, callback was simply not a function.
      if (typeof options === 'function' && callback === noop) { // options was callback, callback was undefined
        //This is fine, callback will be options
      } else if (callback !== noop) { // callback was provided but not a function
        debug('DrachtioAgent#_normalizeParams: Validation Error - callback, if provided, must be a function.');
        throw new TypeError('callback, if provided, must be a function.');
      }
    }

    // After normalization, 'options' must be an object.
    if (typeof options !== 'object' || options === null) {
      debug('DrachtioAgent#_normalizeParams: Validation Error - options parameter must resolve to an object.');
      throw new TypeError('Invalid arguments: options parameter must resolve to an object for a request.');
    }
    if (typeof options.uri !== 'string' || options.uri.length === 0) {
      debug('DrachtioAgent#_normalizeParams: Validation Error - options.uri is required and must be a non-empty string.');
      throw new TypeError('options.uri is required and must be a non-empty string.');
    }
    if (typeof options.method !== 'string' || options.method.length === 0) {
      // method is usually set by the caller of _normalizeParams (e.g. request, uac)
      // but if not, it should be validated before SipMessage construction.
      // For now, we ensure it's at least set before _makeRequest is called.
      // The actual check for valid SIP methods is implicitly done by SipMessage constructor.
      debug('DrachtioAgent#_normalizeParams: Validation Error - options.method is required and must be a non-empty string.');
      throw new TypeError('options.method is required and must be a non-empty string.');
    }


    if (options._socket) {
      if (!typeSocket(options._socket)) {
        debug('DrachtioAgent#_normalizeParams: Validation Error - options._socket must be a valid socket object.');
        throw new TypeError('options._socket must be a valid socket object.');
      }
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

    let m;
    try {
      m = new SipMessage(params.options) ;
    } catch (err) {
      debug('DrachtioAgent#_makeRequest: Error constructing SipMessage: %o', err);
      // Ensure callback is called with error if provided
      if (params.callback && typeof params.callback === 'function') {
        params.callback(new Error(`Error constructing SipMessage for request: ${err.message}`));
      }
      this.emit('error', new Error(`Error constructing SipMessage for request: ${err.message}`));
      return;
    }

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

    // The callback receives responsePayloadTokens = [status, type, source, network, protocol, address, port, time, transactionId, dialogId, ...]
    // and msgSipBody which is the raw SIP message string from the server's response to our command.
    obj.pendingRequests.set(msgId, (responsePayloadTokens, msgSipBody) => {
      // responsePayloadTokens[0] is the status of the drachtio command (e.g. 'OK')
      // responsePayloadTokens[1] is the type of data that follows (e.g. 'sip')
      if (responsePayloadTokens[0] === 'OK' && responsePayloadTokens[1] === 'sip') {
        const transactionId = responsePayloadTokens[8] ; 
        const sipMessageMetadata = { 
          source: responsePayloadTokens[2],   
          address: responsePayloadTokens[5],  
          port: responsePayloadTokens[6],     
          protocol: responsePayloadTokens[4], 
          time: responsePayloadTokens[7],     
          transactionId: transactionId
          // dialogId would be responsePayloadTokens[9] if needed here
        } ;

        let req;
        try {
          // msgSipBody is the actual sip message string from the server response
          req = new Request(new SipMessage(msgSipBody), sipMessageMetadata) ;
        } catch (err) {
          debug('DrachtioAgent#_makeRequest: Error constructing Request from SipMessage: %o', err);
          params.callback(new Error(`Error constructing Request from SipMessage: ${err.message}`));
          this.emit('error', new Error(`Error constructing Request from SipMessage: ${err.message}`));
          return;
        }
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
        // Error from drachtio server for our command, or unexpected response format
        const err = new Error(responsePayloadTokens[1] || `request command failed with status ${responsePayloadTokens[0]}`);
        if (typeof params.callback === 'function') { // Ensure callback exists before calling
          params.callback(err) ;
        } else {
          this.emit('error', err); // Emit a general error if no callback
        }
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
    if (typeof res !== 'object' || res === null || !(res instanceof Response)) {
      debug('DrachtioAgent#sendResponse: Validation Error - res must be an instance of Response.');
      throw new TypeError('res parameter must be an instance of Response.');
    }
    if (opts && (typeof opts !== 'object' || opts === null)) {
      debug('DrachtioAgent#sendResponse: Validation Error - opts must be an object if provided.');
      throw new TypeError('opts parameter must be an object if provided.');
    }
    if (callback && typeof callback !== 'function') {
      debug('DrachtioAgent#sendResponse: Validation Error - callback must be a function if provided.');
      throw new TypeError('callback must be a function if provided.');
    }
    if (fnAck && typeof fnAck !== 'function') {
      debug('DrachtioAgent#sendResponse: Validation Error - fnAck must be a function if provided.');
      throw new TypeError('fnAck must be a function if provided.');
    }

    const obj = this.mapServer.get(res.socket) ;
    debug(`agent#sendResponse: ${JSON.stringify(res.msg)}`);
    if (!obj) {
      callback && callback(new Error('drachtio-agent:sendResponse: socket connection closed'));
      return;
    }
    const msgId = this.sendMessage(res.socket, res.msg, Object.assign({stackTxnId: res.req.stackTxnId}, opts)) ;
    if ((callback && typeof callback === 'function') || fnAck) {

      obj.pendingRequests.set(msgId, (token, msg, meta) => {
        obj.pendingRequests.delete(msgId) ;
        if ('OK' !== token[0]) {
          const err = new Error(token[1] || 'sendResponse failed');
          if (callback) return callback(err) ;
          else this.emit('error', err);
          return;
        }
        let responseMsg;
        try {
          responseMsg = new SipMessage(msg) ;
        } catch (e) {
          debug('DrachtioAgent#sendResponse: Error parsing SipMessage in callback: %o', e);
          if (callback) return callback(new Error(`Error parsing SipMessage in sendResponse callback: ${e.message}`)) ;
          else this.emit('error', new Error(`Error parsing SipMessage in sendResponse callback: ${e.message}`));
          return;
        }
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
    if (typeof method !== 'string' || method.length === 0) {
      debug('DrachtioAgent#sendAck: Validation Error - method is required and must be a non-empty string.');
      throw new TypeError('method is required and must be a non-empty string.');
    }
    if (typeof dialogId !== 'string' || dialogId.length === 0) {
      debug('DrachtioAgent#sendAck: Validation Error - dialogId is required and must be a non-empty string.');
      throw new TypeError('dialogId is required and must be a non-empty string.');
    }
    if (typeof req !== 'object' || req === null || !(req instanceof Request)) {
      debug('DrachtioAgent#sendAck: Validation Error - req must be an instance of Request.');
      throw new TypeError('req parameter must be an instance of Request.');
    }
    if (typeof res !== 'object' || res === null || !(res instanceof Response)) {
      debug('DrachtioAgent#sendAck: Validation Error - res must be an instance of Response.');
      throw new TypeError('res parameter must be an instance of Response.');
    }
    if (opts && (typeof opts !== 'object' || opts === null)) {
      debug('DrachtioAgent#sendAck: Validation Error - opts must be an object if provided.');
      throw new TypeError('opts parameter must be an object if provided.');
    }
    if (callback && typeof callback !== 'function') {
      debug('DrachtioAgent#sendAck: Validation Error - callback must be a function if provided.');
      throw new TypeError('callback must be a function if provided.');
    }
    if (!res.socket) { // res.socket is used to get the 'obj'
      debug('DrachtioAgent#sendAck: Validation Error - res.socket is missing.');
      throw new Error('res.socket is missing, cannot send ACK.');
    }

    assert(this.mapServer.has(res.socket)); // This will now be safer due to check above
    const obj = this.mapServer.get(res.socket) ;
    let sipMessageToSend;
    try {
      sipMessageToSend = new SipMessage() ;
      sipMessageToSend.method = method ;
      sipMessageToSend.uri = req.uri ;
    } catch (err) {
      debug('DrachtioAgent#sendAck: Error constructing SipMessage: %o', err);
      if (callback) callback(new Error(`Error constructing SipMessage for ACK: ${err.message}`));
      else this.emit('error', new Error(`Error constructing SipMessage for ACK: ${err.message}`));
      return;
    }
    opts = opts || {} ;

    Object.assign(opts, {stackDialogId: dialogId}) ;

    const msgId = this.sendMessage(res.socket, sipMessageToSend, opts) ;
    if (callback) {
      obj.pendingRequests.set(msgId, (token, msg, meta) => {
        if ('OK' !== token[0]) {
          return callback(token[1] || 'sendAck failed') ;
        }
        try {
          callback(null, new SipMessage(msg)) ;
        } catch (e) {
          debug('DrachtioAgent#sendAck: Error parsing SipMessage in callback: %o', e);
          callback(new Error(`Error parsing SipMessage in sendAck callback: ${e.message}`));
          this.emit('error', new Error(`Error parsing SipMessage in sendAck callback: ${e.message}`));
        }
      }) ;
    }
  }

  proxy(req, opts, callback) {
    if (typeof req !== 'object' || req === null || !(req instanceof Request)) {
      debug('DrachtioAgent#proxy: Validation Error - req must be an instance of Request.');
      throw new TypeError('req parameter must be an instance of Request.');
    }
    if (typeof opts !== 'object' || opts === null) {
      debug('DrachtioAgent#proxy: Validation Error - opts must be an object.');
      throw new TypeError('opts parameter must be an object.');
    }
    if (!Array.isArray(opts.destination) || opts.destination.length === 0) {
      debug('DrachtioAgent#proxy: Validation Error - opts.destination is required and must be a non-empty array.');
      throw new TypeError('opts.destination is required and must be a non-empty array.');
    }
    if (!opts.destination.every(dest => typeof dest === 'string' && dest.length > 0)) {
      debug('DrachtioAgent#proxy: Validation Error - all elements in opts.destination must be non-empty strings.');
      throw new TypeError('All elements in opts.destination must be non-empty strings.');
    }
    if (callback && typeof callback !== 'function') {
      debug('DrachtioAgent#proxy: Validation Error - callback must be a function if provided.');
      throw new TypeError('callback must be a function if provided.');
    }
    if (!req.socket) { // req.socket is used to get the 'obj'
      debug('DrachtioAgent#proxy: Validation Error - req.socket is missing.');
      throw new Error('req.socket is missing, cannot proxy.');
    }

    const obj = this.mapServer.get(req.socket) ; // Safe due to check above
    let proxyMessage;
    try {
      proxyMessage = new SipMessage({
        uri: opts.destination[0],
        method: req.method
      }) ;

      if (opts.headers) {
        for (const hdr in (opts.headers || {})) {
          proxyMessage.set(hdr, opts.headers[hdr]) ;
        }
      }
    } catch (err) {
      debug('DrachtioAgent#proxy: Error constructing SipMessage for proxy: %o', err);
      if (callback) callback(new Error(`Error constructing SipMessage for proxy: ${err.message}`));
      else this.emit('error', new Error(`Error constructing SipMessage for proxy: ${err.message}`));
      return;
    }

    const msg = `proxy|${opts.stackTxnId}|${(opts.remainInDialog ? 'remainInDialog' : '')}` +
    `|${(opts.fullResponse ? 'fullResponse' : '')}|${(opts.followRedirects ? 'followRedirects' : '')}` +
    `|${(opts.simultaneous ? 'simultaneous' : 'serial')}|${opts.provisionalTimeout}|${opts.finalTimeout}` +
    `|${opts.destination.join('|')}${CRLF}${proxyMessage.toString()}` ;

    const msgId = this.wp.send(req.socket, msg) ;
    obj.pendingRequests.set(msgId, (token, rawMsg) => { // Added rawMsg for consistency, though proxy callback might not use it
      if (token[0] === 'OK') {
        // Proxy typically doesn't return a SIP message in the success callback
        // It signals that the proxy request was accepted by the server
        // The actual SIP responses will arrive as separate 'sip' messages
        if (callback) callback(null);
      } else {
        const err = new Error(token[1] || 'proxy request failed');
        if (callback) callback(err);
        else this.emit('error', err);
      }
    });
    // since we are proxying the INVITE we wont be explicitly sending a final response later
    obj.pendingNetworkInvites.delete(req.get('Call-Id'));
    debug(`proxying call, pendingNetworkInvites size is now ${obj.pendingNetworkInvites.size}`);
  }

  set(prop, val) {
    if (typeof prop !== 'string' || prop.length === 0) {
      debug('DrachtioAgent#set: Validation Error - prop is required and must be a non-empty string.');
      throw new TypeError('prop is required and must be a non-empty string.');
    }
    if (typeof val === 'undefined') {
      debug('DrachtioAgent#set: Validation Error - val is required.');
      throw new TypeError('val is required.');
    }

    switch (prop) {
      case 'handler':
        if (typeof val !== 'function') {
          debug('DrachtioAgent#set: Validation Error - handler value must be a function.');
          throw new TypeError('handler value must be a function.');
        }
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
    if (typeof verb !== 'string' || verb.length === 0) {
      debug('DrachtioAgent#route: Validation Error - verb is required and must be a non-empty string.');
      throw new TypeError('verb is required and must be a non-empty string.');
    }
    if (this.verbs.has(verb)) {
      // This was already here, just adding debug log for consistency
      debug('DrachtioAgent#route: Error - duplicate route request for verb: %s', verb);
      throw new Error('duplicate route request for ' + verb) ;
    }
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

  removeRoute(verb) {
    if (typeof verb !== 'string' || verb.length === 0) {
      debug('DrachtioAgent#removeRoute: Validation Error - verb is required and must be a non-empty string.');
      throw new TypeError('verb is required and must be a non-empty string.');
    }
    if (!this.verbs.has(verb)) {
      // This was already here, just adding debug log for consistency
      debug('DrachtioAgent#removeRoute: Error - no route request to remove for verb: %s', verb);
      throw new Error('no route request to remove for ' + verb) ;
    }

    this.mapServer.forEach((obj, socket) => {
      if (obj.authenticated) {
        this.wp.send(socket, 'remove_route|' + verb) ;
        this.verbs.delete(verb) ;
      }
    });
  }

  disconnect(socket) {
    // socket is optional. If provided, it must be a valid socket object.
    if (socket && !typeSocket(socket)) {
      debug('DrachtioAgent#disconnect: Validation Error - provided socket is not a valid net.Socket or tls.TLSSocket object.');
      throw new TypeError('Provided socket is not a valid net.Socket or tls.TLSSocket object.');
    }

    const sock = socket || this._getDefaultSocket();
    // _getDefaultSocket might return undefined if mapServer is empty.
    // wp.disconnect should handle undefined 'sock' if it intends to close all sockets,
    // or sock should always be valid if wp.disconnect expects a specific socket.
    // Assuming wp.disconnect(undefined) means disconnect all, or is a no-op if no sockets.
    if (sock) { // Only log if sock is defined, as sockPort would fail on undefined
      debugSocket(`disconnect: removing socket ${sockPort(sock)}`);
    } else if (socket) { // User provided a socket, but it was not found (e.g. already removed) or invalid
      debugSocket('disconnect: provided socket was specified but not found or invalid for detailed logging.');
    } else {
      debugSocket('disconnect: no specific socket provided, will disconnect default or all.');
    }

    this.wp.disconnect(sock) ; // Let WireProtocol handle undefined sock if it means 'all'
    if (socket && this.mapServer.has(socket)) { // Ensure socket exists in map before delete
      this.mapServer.delete(socket);
      debugSocket(`disconnect: after delete there are ${this.mapServer.size} entries in mapServer`);
    } else if (socket) {
      debugSocket(`disconnect: provided socket was not in mapServer, size is ${this.mapServer.size}`);
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
      //any ping request awaiting a response from a drachtio server
      pendingPingRequests: new Set(),
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
        obj.serverVersion = response.length > 2 ? response[2] : null;
        obj.localHostports = response.length > 3 ? response[3] : null;
        debug('sucessfully authenticated, hostport is ', obj.hostport) ;

        if (this.wp.isClient) {
          this.routeVerbs(socket, obj) ;
          setImmediate(() => {
            this.emit('connect', null, obj.hostport, obj.serverVersion, obj.localHostports);
          });
        }
        else {
          this.emit('connect', null, obj.hostport, obj.serverVersion, obj.localHostports);
        }
        if (serverVersionAtLeast(obj.serverVersion, 'v0.8.2')) {
          debug(`server version ${obj.serverVersion} supports pinging`);
          this.wp.startPinging(socket);
        }
      }
      else {
        const authError = new Error('failed to authenticate to server');
        this.emit('connect', authError) ;
        this.emit('error', authError); // Also emit a general 'error'
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
    const msgType = token[1];
    let rawMsg; // Keep rawMsg in the outer scope if needed by multiple handlers or for default

    switch (msgType) {
      case 'sip':
        this._handleSipMsg(socket, token, msg, obj, pos);
        break ;

      case 'response':
        this._handleResponseMsg(socket, token, msg, obj, pos);
        break ;

      case 'cdr:attempt':
      case 'cdr:start':
      case 'cdr:stop':
        this._handleCdrMsg(socket, token, msg, obj, pos);
        break ;

      default:
        // It's good practice to log or handle unknown message types.
        debug(`DrachtioAgent#_onMsg: Received unhandled message type: '${msgType}', full message: '${msg}'`);
        throw new Error(
          `invalid msg type: '${msgType}', msg: '${msg}'`) ;
    }
  }

  _handleSipMsg(socket, token, originalFullMsg, obj, pos) {
    // obj is mapServer.get(socket)
    // token is leader.split('|')
    // originalFullMsg is the full message string
    // pos is originalFullMsg.indexOf(CR)
    let rawMsg = originalFullMsg.slice(pos + 2) ;
    let sipMsg;

    if (!obj) {
      debug('DrachtioAgent#_handleSipMsg: socket data not found in mapServer, message discarded');
      return ;
    }

    try {
      sipMsg = new SipMessage(rawMsg) ;
    } catch (err) {
      debug(`DrachtioAgent#_handleSipMsg: Error parsing incoming SIP message: %o, raw message: ${rawMsg}`, err);
      this.emit('error', new Error(`Error parsing incoming SIP message: ${err.message}`));
      return;
    }

    const source = token[2] ;
    const protocol = token[4] ;
    const address = token[5] ;
    const port = token[6] ;
    const time = token[7] ;
    const transactionId = token[8] ;
    const dialogId = token[9] ; // Used by helpers
    const server = {
      address: socket.remoteAddress,
      hostport: obj.hostport
    };
    let receivedOn;
    if (token.length > 11) {
      receivedOn = token[10] + ':' + token[11];
    }
    // meta is used by all helpers
    const meta = { source, address, port, protocol, time, transactionId, dialogId, server, receivedOn } ; 
    debug(`DrachtioAgent#_handleSipMsg: tokens: ${JSON.stringify(token)}`);

    if (token.length <= 9) { // Ensure basic token length for SIP messages
      debug('DrachtioAgent#_handleSipMsg: Token length too short for a valid SIP message structure.');
      return; 
    }

    if ('network' === source) {
      if (sipMsg.type === 'request') {
        this._handleNetworkSipRequest(socket, sipMsg, meta, obj, token);
      } else { // SIP Response from network
        this._handleNetworkSipResponse(socket, sipMsg, meta, obj, token);
      }
    }
    else if ('application' === source && sipMsg.type === 'request' && transactionId === 'unsolicited') {
      this._handleAppSipUnsolicitedRequest(socket, sipMsg, meta, obj);
    } else {
      debug(`DrachtioAgent#_handleSipMsg: Unhandled SIP message source/type combination: source='${source}', type='${sipMsg.type}', txId='${transactionId}'`);
    }
  }

  _handleNetworkSipRequest(socket, sipMsg, meta, obj, token) {
    const callId = sipMsg.get('call-id') ;
    const dialogId = meta.dialogId; // from meta, which got it from token[9]

    if ('CANCEL' === sipMsg.method) {
      if (obj.pendingNetworkInvites.has(callId)) {
        obj.pendingNetworkInvites.get(callId).req.emit('cancel', sipMsg) ;
        obj.pendingNetworkInvites.delete(callId) ;
        debug(`DrachtioAgent#_handleNetworkSipRequest: emitted cancel event for INVITE with call-id ${callId}` +
          `, remaining count of invites in progress: ${obj.pendingNetworkInvites.size}`);
      } else {
        debug(`DrachtioAgent#_handleNetworkSipRequest: got CANCEL for call-id ${callId} that was not found`);
      }
      return;
    }

    debug(`DrachtioAgent#_handleNetworkSipRequest: meta: ${JSON.stringify(meta)}`);
    let req, res;
    try {
      req = new Request(sipMsg, meta) ;
      res = new Response() ;
    } catch (err) {
      debug('DrachtioAgent#_handleNetworkSipRequest: Error constructing Request/Response: %o', err);
      this.emit('error', new Error(`Error constructing Request/Response for network SIP request: ${err.message}`));
      return;
    }
    req.res = res ;
    res.req = req ;
    req.agent = res.agent = this ;
    req.socket = res.socket = socket ;

    if ('INVITE' === req.method) {
      obj.pendingNetworkInvites.set(callId, { req, res }) ;
      debug(`DrachtioAgent#_handleNetworkSipRequest: tracking an incoming invite with call-id ${callId}, ` +
        `currently tracking ${obj.pendingNetworkInvites.size} invites in progress`);
    }
    else if (('PRACK' === req.method || 'ACK' === req.method) && obj.pendingAckOrPrack.has(dialogId)) {
      const fnAck = obj.pendingAckOrPrack.get(dialogId);
      obj.pendingAckOrPrack.delete(dialogId);
      fnAck(req) ;
    }
    this.puntUpTheMiddleware(req, res) ;
  }

  _handleNetworkSipResponse(socket, sipMsg, meta, obj, token) {
    const transactionId = meta.transactionId; 
    const dialogId = meta.dialogId;       
    let sr; 

    debug('DrachtioAgent#_handleNetworkSipResponse: received sip response from network');
    if (!obj.pendingSipRequests.has(transactionId)) {
      debug(`DrachtioAgent#_handleNetworkSipResponse: Received SIP response for unknown transactionId: ${transactionId}`);
      return;
    }
    
    sr = obj.pendingSipRequests.get(transactionId) ;
    let res; 
    try {
      res = new Response(this) ; 
    } catch (err) {
      debug('DrachtioAgent#_handleNetworkSipResponse: Error constructing Response for pendingSipRequest: %o', err);
      this.emit('error', new Error(`Error constructing Response for network SIP response: ${err.message}`));
      if (sr && sr.req && sr.req.emit) {
        sr.req.emit('error', new Error(`Error constructing Response object: ${err.message}`));
      }
      obj.pendingSipRequests.delete(transactionId);
      return;
    }
    res.msg = sipMsg ;
    res.meta = meta ;
    res.req = sr.req ; 
    res.socket = res.req.socket = socket ;

    debug('DrachtioAgent#_handleNetworkSipResponse: got a response with status: %d', res.status) ;

    if (res.status >= 200) {
      obj.pendingSipRequests.delete(transactionId)  ;
    }

    let ack = noop ;
    if (res.status >= 200 && res.req.method === 'INVITE') {
      ack = Response.prototype.sendAck.bind(res, dialogId) ; 
    }
    else if (res.status > 100 && res.status < 200) {
      const prackNeeded = res.get('RSeq');
      if (prackNeeded) {
        ack = Response.prototype.sendPrack.bind(res, dialogId) ; 
      }
    }
    
    const cid = res.msg.headers['call-id'];
    if (obj.pendingSipAuthRequests.has(cid)) {
      obj.pendingSipAuthRequests.delete(cid) ;
      this.pendingSipAuthTxnIdUpdate.delete(res.req.stackTxnId);
      // If we already handled auth for this call-id and got another response, emit it.
      // This case might be rare, implies server sent multiple responses to an auth'd request,
      // or a new challenge after successful auth for the same call-id.
      sr.req.emit('response', res, ack);
    }
    else if ((401 === res.status || 407 === res.status) && (!!res.req.auth)) {
      this._handleDigestAuthentication(res, sr, ack, obj, cid);
    }
    else {
      sr.req.emit('response', res, ack) ;
    }
  }

  _handleDigestAuthentication(res, sr, ack, obj, callId) {
    // res: The incoming 401/407 Response object
    // sr: The pendingSipRequest object { req: originalOutgoingRequest }
    // ack: The pre-bound ack/prack function for the original request, if needed for non-auth responses
    // obj: mapServer entry for the current socket
    // callId: The call-id of the challenged request

    obj.pendingSipAuthRequests.set(callId, true) ;
    this.pendingSipAuthTxnIdUpdate.set(res.req.stackTxnId, {}); // Prepare for potential txnId update
    let client;
    try {
      client = new DigestClient(res) ;
    } catch (e) {
      debug('DrachtioAgent#_handleDigestAuthentication: Error constructing DigestClient: %o', e);
      this.emit('error', new Error(`Error constructing DigestClient: ${e.message}`));
      sr.req.emit('response', res, ack); // Emit original 401/407 response
      obj.pendingSipAuthRequests.delete(callId) ; 
      this.pendingSipAuthTxnIdUpdate.delete(res.req.stackTxnId); 
      return;
    }

    client.authenticate((err, authenticatedReq) => {
      if (err) { 
        debug('DrachtioAgent#_handleDigestAuthentication: DigestClient authentication error: %o', err);
        this.emit('error', new Error(`DigestClient authentication error: ${err.message}`));
        sr.req.emit('response', res, ack); // Emit original 401/407 response
        obj.pendingSipAuthRequests.delete(callId) ; 
        this.pendingSipAuthTxnIdUpdate.delete(res.req.stackTxnId); 
        return;
      }
      if (!authenticatedReq) { // Should not happen if err is null, but good practice
        debug('DrachtioAgent#_handleDigestAuthentication: DigestClient returned no error and no new request.');
        sr.req.emit('response', res, ack); // Emit original 401/407 response
        obj.pendingSipAuthRequests.delete(callId) ; 
        this.pendingSipAuthTxnIdUpdate.delete(res.req.stackTxnId);
        return;
      }

      // Successfully created a new request with credentials
      // Move listeners from the old request (sr.req) to the new one (authenticatedReq)
      sr.req.listeners('response').forEach((l) => { authenticatedReq.on('response', l) ; }) ;
      // Emit 'authenticate' on the original request, providing the new request object
      // This allows the application to potentially store the new transactionId or update its state.
      sr.req.emit('authenticate', authenticatedReq) ;

      // Check if any command (like CANCEL) was held pending this auth completion
      const heldParams = this.pendingSipAuthTxnIdUpdate.get(res.req.stackTxnId);
      if (heldParams && heldParams.options && heldParams.options.stackTxnId) {
        debug(
          `DrachtioAgent#_handleDigestAuthentication: uac-auth: sending out delayed ${heldParams.options.method} originally for ${res.req.stackTxnId}`);
        heldParams.options.stackTxnId = authenticatedReq.stackTxnId; // Update to new transaction ID
        this._makeRequest(heldParams); // Send the held request
      }
      // Clean up the pending update for the old transaction ID
      this.pendingSipAuthTxnIdUpdate.delete(res.req.stackTxnId);

      // Ensure that if the application calls req.cancel() on the *original* request object (sr.req),
      // it still works by updating its stackTxnId to the new one.
      debug(`DrachtioAgent#_handleDigestAuthentication: uac-auth: new transaction ${authenticatedReq.stackTxnId} overwrites ${res.req.stackTxnId}`);
      sr.req.stackTxnId = authenticatedReq.stackTxnId;

      // Note: We don't emit 'response' for the 401/407 here if we are handling auth.
      // The 'response' event will be emitted when the server responds to 'authenticatedReq'.
    }) ;
  }

  _handleAppSipUnsolicitedRequest(socket, sipMsg, meta, obj) {
    debug('DrachtioAgent#_handleAppSipUnsolicitedRequest: received unsolicited request sent from application');
    let req, res;
    try {
      req = new Request(sipMsg, meta) ;
      res = new Response() ;
    } catch (err) {
      debug('DrachtioAgent#_handleAppSipUnsolicitedRequest: Error constructing Request/Response: %o', err);
      this.emit('error', new Error(`Error constructing Request/Response for unsolicited app SIP request: ${err.message}`));
      return;
    }
    req.res = res ;
    res.req = req ;
    req.agent = res.agent = this ;
    req.socket = res.socket = socket ;
    res.send = noop; // Stub out send for unsolicited requests
    this.puntUpTheMiddleware(req, res);
  }

  _handleResponseMsg(socket, token, originalFullMsg, obj, pos) {
    // obj is mapServer.get(socket)
    // token is leader.split('|')
    // originalFullMsg is the full message string
    // pos is originalFullMsg.indexOf(CR)
    let rawMsg;

    if (!obj) {
      debug('DrachtioAgent#_handleResponseMsg: socket data not found in mapServer, message discarded');
      return ;
    }

    const rId = token[1] ; 
    const status = token[2]; 

    if (obj.pendingPingRequests.has(rId)) {
      obj.pendingPingRequests.delete(rId); 
      debug(`DrachtioAgent#_handleResponseMsg: got pong response with msgId ${rId}, count outstanding: ${obj.pendingPingRequests.size}`);
    }
    else if (obj.pendingRequests.has(rId)) {
      if (-1 !== pos) { rawMsg = originalFullMsg.slice(pos + 2) ; } 
      
      const serverResponseDataTokens = token.slice(3); 
      const meta2 = { 
        source: serverResponseDataTokens[1], 
        address: serverResponseDataTokens[4], 
        port: serverResponseDataTokens[5],    
        protocol: serverResponseDataTokens[3],
        time: serverResponseDataTokens[6],    
        transactionId: serverResponseDataTokens[7], 
        dialogId: serverResponseDataTokens[8]       
      } ;

      const responsePayloadTokens = token.slice(2); 
      const fn = obj.pendingRequests.get(rId).bind(this, responsePayloadTokens, rawMsg, meta2) ;
      
      if (token[token.length - 1] !== 'continue') {
        obj.pendingRequests.delete(rId) ;
      }
      fn() ;
    }
    else if (status && status !== 'OK') {
      const errorDetails = token.slice(3).join('|') || status; 
      debug(`DrachtioAgent#_handleResponseMsg: Received error response for rId ${rId}, status: ${status}, details: ${errorDetails}`);
      this.emit('error', new Error(`Server command ${rId} failed: ${errorDetails}`));
    }
  }

  _handleCdrMsg(socket, token, originalFullMsg, obj, pos) {
    // obj is mapServer.get(socket)
    // token is leader.split('|')
    // originalFullMsg is the full message string
    // pos is originalFullMsg.indexOf(CR)
    let rawMsg = originalFullMsg.slice(pos + 2);
    let cdrSipMsg;

    const cdrEvent = token[1].slice(4)  ; // cdr:attempt -> attempt
    const msgSource = token[2] ;
    const msgTime = token[3] ;
    
    try {
      cdrSipMsg = new SipMessage(rawMsg) ;
    } catch (err) {
      debug(`DrachtioAgent#_handleCdrMsg: Error parsing CDR SIP message: %o, raw message: ${rawMsg}`, err);
      this.emit('error', new Error(`Error parsing CDR SIP message: ${err.message}`));
      return;
    }
    const args = [msgSource, msgTime] ;
    if (cdrEvent !== 'attempt') { args.push(token[4]) ; } // Duration for start/stop
    args.push(cdrSipMsg) ;

    if (this.cdrHandlers.has(cdrEvent)) {
      this.cdrHandlers.get(cdrEvent).apply(this, args) ;
    } else {
      debug(`DrachtioAgent#_handleCdrMsg: No handler for CDR event: ${cdrEvent}`);
    }
  }
}

DrachtioAgent.prototype.uac = DrachtioAgent.prototype.request ; // alias

module.exports = DrachtioAgent ;
