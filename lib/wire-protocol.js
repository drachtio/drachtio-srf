const Emitter = require('events');
const net = require('net');
const tls = require('tls');
const uuidV4 = require('uuid-random') ;
const debug = require('debug')('drachtio:agent');
const noop = require('node-noop').noop;
const CRLF = '\r\n' ;
const assert = require('assert');
const DEFAULT_PING_INTERVAL = 15000;
const MIN_PING_INTERVAL = 5000;
const MAX_PING_INTERVAL = 300000;

const containsEmoji = (str) => {
  const regex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;
  return regex.test(str);
};

const countSymbols = (text) => {
  //return containsEmoji(text) ? [...text].length : text.length;
  return text.length;
};

const parseMessageLengthSpecifierLegacy = (str) => {
  let start = -1;
  for (let i = 0; i < 5; i++) {
    if (start === -1 && (str[i] === ' ' || str[i] == '\n' || str[i] === '\r')) {
      continue;
    }
    if (start === -1) start = i;
    const x = str[i];
    if (i > 0 && x === '#') {
      return {
        numChars: i,
        len: parseInt(str.slice(start, i))
      };
    }
    if (x < '0' || x > '9') return;
  }
  return str[5] === '#' ?
    {
      numChars: 5,
      len: parseInt(str.slice(start, 5))
    } : undefined;
};

const parseMessageLengthSpecifier = (buffer) => {
  for (let i = 0; i < 6; i++) {
    const x = buffer[i];
    if (i > 0 && x === 35) { // ASCII code for '#'
      return {
        numChars: i,
        len: parseInt(buffer.slice(0, i).toString(), 10)
      };
    }
    if (x < 48 || x > 57) return; // ASCII codes for '0' to '9'
  }
  return undefined;
};
module.exports = class WireProtocol extends Emitter {

  constructor(opts) {
    super() ;

    this._logger = opts.logger || noop ;
    this.mapIncomingMsg = new Map() ;

    this.enablePing = false;
    this.pingInterval = DEFAULT_PING_INTERVAL;
    this.mapTimerPing = new Map();
    this.legacy = false;
  }

  connect(opts) {
    // inbound connection to drachtio server
    let socket;
    assert.ok(typeof this.server === 'undefined', 'WireProtocol#connect: cannot be both client and server');
    this.host = opts.host ;
    this.port = opts.port ;
    this.reconnectOpts = opts.reconnect || {} ;
    this.reconnectVars = {} ;
    this._evalPingOpts(opts);
    if (opts.tls) {
      debug(`wp connecting (tls) to ${this.host}:${this.port}`);
      socket = tls.connect(opts.port, opts.host, opts.tls, () => {
        debug(`tls socket connected: ${socket.authorized}`);
      });
    }
    else {
      debug(`wp connecting (tcp) to ${this.host}:${this.port}`);
      socket = net.connect({
        port: opts.port,
        host: opts.host
      }) ;
    }
    socket.setNoDelay(true);
    socket.setKeepAlive(true);
    this.installListeners(socket) ;
  }

  _evalPingOpts(opts) {
    if (opts.enablePing === true) {
      this.enablePing = true;
      if (opts.pingInterval) {
        const interval = parseInt(opts.pingInterval);
        assert.ok(interval >= MIN_PING_INTERVAL,
          `Srf#connect: opts.pingInterval must be greater than or equal to ${MIN_PING_INTERVAL}`);
        assert.ok(interval <= MAX_PING_INTERVAL,
          `Srf#connect: opts.pingInterval must be less than or equal to ${MAX_PING_INTERVAL}`);
        this.pingInterval = interval;
      }
    }
  }

  startPinging(socket) {
    if (!this.enablePing) return;
    assert.ok(!this.mapTimerPing.has(socket), 'duplicate call to startPinging for this socket');
    const timerPing = setInterval(() => {
      if (socket && !socket.destroyed) {
        const msgId = this.send(socket, 'ping');
        this.emit('ping', {msgId, socket});
      }
    }, this.pingInterval);
    this.mapTimerPing.set(socket, timerPing);
  }

  _stopPinging(socket) {
    const timerPing = this.mapTimerPing.get(socket);
    if (timerPing) {
      clearInterval(timerPing);
      this.mapTimerPing.delete(socket);
    }
  }

  listen(opts) {
    assert.ok(typeof this.reconnectOpts === 'undefined', 'WireProtocol#listen: cannot be both server and client');
    this._evalPingOpts(opts);

    let useTls = false;
    if (opts.server instanceof net.Server) {
      this.server = opts.server ;
    }
    else if (opts.tls) {
      useTls = true;
      this.server = tls.createServer(opts.tls);
      this.server.listen(opts.port, opts.host);
    }
    else {
      this.server = net.createServer() ;
      this.server.listen(opts.port, opts.host) ;
    }
    this.server.on('listening', () => {
      debug(`wp listening on ${JSON.stringify(this.server.address())} for ${useTls ? 'tls' : 'tcp'} connections`);
      this.emit('listening');
    });

    if (useTls) {
      this.server.on('secureConnection', (socket) => {
        debug('wp tls handshake succeeded');
        socket.setKeepAlive(true);
        this.installListeners(socket);
        this.emit('connection', socket);
      });
    }
    else {
      this.server.on('connection', (socket) => {
        debug(`wp received connection from ${socket.remoteAddress}:${socket.remotePort}`);
        socket.setKeepAlive(true);
        this.installListeners(socket);
        this.emit('connection', socket);
      });
    }
    return this.server ;
  }

  get isServer() {
    return this.server ;
  }

  get isClient() {
    return !this.isServer ;
  }

  setLogger(logger) {
    this._logger = logger ;
  }
  removeLogger() {
    this._logger = function() {} ;
  }

  installListeners(socket) {
    //receive buffers
    //socket.setEncoding('utf8') ;

    socket.on('error', (err) => {
      debug(`wp#on error - ${err} ${this.host}:${this.port}`);
      if (this.enablePing) this._stopPinging(socket);

      if (this.isServer || this.closing) {
        return;
      }

      this.emit('error', err, socket);

      // "error" events get turned into exceptions if they aren't listened for.  If the user handled this error
      // then we should try to reconnect.
      this._onConnectionGone();
    });

    socket.on('connect', () => {
      debug(`wp#on connect ${this.host}:${this.port}`);
      if (this.isClient) {
        this.initializeRetryVars() ;
      }
      this.emit('connect', socket);
    }) ;

    socket.on('close', () => {
      debug(`wp#on close ${this.host}:${this.port}`);
      if (this.enablePing) this._stopPinging(socket);
      if (this.isClient) {
        this._onConnectionGone();
      }
      this.mapIncomingMsg.delete(socket) ;
      this.emit('close', socket) ;
    }) ;

    socket.on('data', (this.legacy ? this._onDataLegacy : this._onData).bind(this, socket)) ;
  }

  initializeRetryVars() {
    assert(this.isClient);

    this.reconnectVars.retryTimer = null;
    this.reconnectVars.retryTotaltime = 0;
    this.reconnectVars.retryDelay = 150;
    this.reconnectVars.retryBackoff = 1.7;
    this.reconnectVars.attempts = 1;
  }

  _onConnectionGone() {
    assert(this.isClient);

    // If a retry is already in progress, just let that happen
    if (this.reconnectVars.retryTimer) {
      debug('WireProtocol#connection_gone: retry is already in progress') ;
      return;
    }

    // If this is a requested shutdown, then don't retry
    if (this.closing) {
      this.reconnectVars.retryTimer = null;
      return;
    }

    const nextDelay = Math.floor(this.reconnectVars.retryDelay * this.reconnectVars.retryBackoff);
    if (this.reconnectOpts.retryMaxDelay !== null && nextDelay > this.reconnectOpts.retryMaxDelay) {
      this.reconnectVars.retryDelay = this.reconnectOpts.retryMaxDelay;
    } else {
      this.reconnectVars.retryDelay = nextDelay;
    }

    if (this.reconnectOpts.maxAttempts && this.reconnectVars.attempts >= this.reconnectOpts.maxAttempts) {
      this.reconnectVars.retryTimer = null;
      return;
    }

    this.reconnectVars.attempts += 1;
    this.emit('reconnecting', {
      delay: this.reconnectVars.retryDelay,
      attempt: this.reconnectVars.attempts
    });
    this.reconnectVars.retryTimer = setTimeout(() => {
      this.reconnectVars.retryTotaltime += this.reconnectVars.retryDelay;

      if (this.reconnectOpts.connectTimeout && this.reconnectVars.retryTotaltime >= this.reconnectOpts.connectTimeout) {
        this.reconnectVars.retryTimer = null;
        console.error('WireProtocol#connection_gone: ' +
          `Couldn't get drachtio connection after ${this.reconnectVars.retryTotaltime} ms`);
        return;
      }
      this.socket = net.connect({
        port: this.port,
        host: this.host
      }) ;
      this.socket.setKeepAlive(true) ;
      this.installListeners(this.socket) ;

      this.reconnectVars.retryTimer = null;
    }, this.reconnectVars.retryDelay);
  }

  send(socket, msg) {
    const msgId = uuidV4() ;
    const s = msgId + '|' + msg ;
    socket.write(Buffer.byteLength(s, 'utf8') + '#' + s, () => {
      debug(`wp#send ${this.host}:${this.port} - ${s.length}#${s}`);
    }) ;
    this._logger('===>' + CRLF + Buffer.byteLength(s, 'utf8') + '#' + s + CRLF) ;
    return msgId ;
  }

  processMessageBufferLegacy(socket, obj, length, start) {
    let haveMsg = false;

    do {
      const msg = [...obj.incomingMsg].slice(start, start + length).join('');
      this.emit('msg', socket, msg, {length, start, fullMsg: obj.incomingMsg});
      obj.incomingMsg = [...obj.incomingMsg].slice(start + length).join('');

      // check for another message
      const arr = /^(\d{1,5})#/.exec(obj.incomingMsg);
      if (arr) {
        length = parseInt(arr[1]);
        start =  arr[1].length + 1;
        haveMsg = [...obj.incomingMsg].length >= length + start;
      }
      else haveMsg = false;
    } while (haveMsg);
  }

  processMessageBuffer(socket, obj, length, start) {
    let haveMsg = false;

    do {
      const msg = obj.incomingMsg.slice(start, start + length).toString('utf8');
      this.emit('msg', socket, msg, { length, start, fullMsg: obj.incomingMsg });
      obj.incomingMsg = obj.incomingMsg.slice(start + length);

      // Check for another message
      const arr = /^(\d{1,5})#/.exec(obj.incomingMsg.toString());
      if (arr) {
        length = parseInt(arr[1], 10);
        start = arr[1].length + 1;
        haveMsg = obj.incomingMsg.length >= length + start;
      } else {
        haveMsg = false;
      }
    } while (haveMsg);
  }

  _onDataLegacy(socket, msg) {
    this._logger(`<===${CRLF}${msg}${CRLF}`) ;
    debug(`<===${msg}`) ;

    if (!this.mapIncomingMsg.has(socket)) {
      this.mapIncomingMsg.set(socket, {
        incomingMsg: '',
        length: -1
      });
    }
    const obj = this.mapIncomingMsg.get(socket) ;

    // append new text to cached
    obj.incomingMsg += msg;

    // check if we have a full message to process
    const {numChars, len} = parseMessageLengthSpecifierLegacy(obj.incomingMsg) || {};
    if (len) {
      if ([...obj.incomingMsg].length >= len + numChars + 1) {
        this.processMessageBufferLegacy(socket, obj, len, numChars + 1);
      }
      return;
    }
    else if (obj.incomingMsg.match(/^\d{1,5}/)) {
      // split in the middle of length specifier
      return;
    }

    const err = new Error(`invalid message, missing length specifier: '${obj.incomingMsg}'`);
    if (this.isServer) {
      console.error(`invalid client message, closing socket: ${err}`);
      this.disconnect(socket);
    }
    else throw err;
  }

  _onData(socket, data) {
    //const msg = data.toString('utf8');
    //this._logger(`<===${CRLF}${msg}${CRLF}`) ;
    //debug(`<===${msg}`) ;

    if (!this.mapIncomingMsg.has(socket)) {
      this.mapIncomingMsg.set(socket, {
        incomingMsg: Buffer.alloc(0),
        length: -1
      });
    }
    const obj = this.mapIncomingMsg.get(socket) ;

    // append new text to cached
    obj.incomingMsg = Buffer.concat([obj.incomingMsg, data]);

    // Check if we have a full message to process
    const parsed = parseMessageLengthSpecifier(obj.incomingMsg);
    if (parsed) {
      const {numChars, len} = parsed;
      if (obj.incomingMsg.length >= len + numChars + 1) {
        debug(`Got a full message: ${len + numChars + 1} bytes expected, received ${obj.incomingMsg.length}`);
        this.processMessageBuffer(socket, obj, len, numChars + 1);
        return;
      }
    } else if (/^\d{1,5}/.test(obj.incomingMsg.toString())) {
      // Split in the middle of length specifier
      return;
    }
    const err = new Error(`invalid message from server, did not start with length specifier: ${obj.incomingMsg}`);
    if (this.isServer) {
      console.error(`invalid client message, closing socket: ${err}`);
      this.disconnect(socket);
    }
    else throw err;
  }

  disconnect(socket) {
    this.closing = true ;
    this.mapIncomingMsg.delete(socket);
    if (!socket) { throw new Error('socket is not connected or was not provided') ; }
    this._stopPinging(socket);
    socket.end() ;
  }

  close(callback) {
    assert.ok(this.isServer, 'WireProtocol#close only valid in outbound connection (server) mode');
    this.server.close(callback) ;
  }

} ;
