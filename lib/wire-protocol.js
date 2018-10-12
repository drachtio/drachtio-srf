const Emitter = require('events');
const net = require('net');
const uuidV4 = require('uuid/v4') ;
const debug = require('debug')('drachtio:agent');
const noop = require('node-noop').noop;
const CRLF = '\r\n' ;
const assert = require('assert');

module.exports = class WireProtocol extends Emitter {

  constructor(opts) {
    super() ;

    this._logger = opts.logger || noop ;
    this.mapIncomingMsg = new Map() ;
  }

  connect(opts) {
    // inbound connection to drachtio server
    assert.ok(typeof this.server === 'undefined', 'WireProtocol#connect: cannot be both client and server');
    this.host = opts.host ;
    this.port = opts.port ;
    this.reconnectOpts = opts.reconnect || {} ;
    this.reconnectVars = {} ;
    debug(`wp connecting to ${this.host}:${this.port}`);
    const socket = net.connect({
      port: opts.port,
      host: opts.host
    }) ;

    socket.setKeepAlive(true);
    this.installListeners(socket) ;
  }

  listen(opts) {
    assert.ok(typeof this.reconnectOpts === 'undefined', 'WireProtocol#listen: cannot be both server and client');

    if (opts.server instanceof net.Server) {
      this.server = opts.server ;
    }
    else {
      this.server = net.createServer() ;
      this.server.listen(opts.port, opts.host) ;
    }
    this.server.on('listening', () => {
      debug(`wp listening on ${JSON.stringify(this.server.address())}`);
      this.emit('listening');
    });
    this.server.on('connection', (socket) => {
      debug(`wp received connection from ${socket.remoteAddress}:${socket.remotePort}`);
      socket.setKeepAlive(true);
      this.installListeners(socket);
      this.emit('connection', socket);
    });
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
    socket.setEncoding('utf8') ;

    socket.on('error', (err) => {
      debug(`wp#on error - ${err} ${this.host}:${this.port}`);

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
      if (this.isClient) {
        this._onConnectionGone();
      }
      this.mapIncomingMsg.delete(socket) ;
      this.emit('close', socket) ;
    }) ;

    socket.on('data', this._onData.bind(this, socket)) ;
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

  /*
   * Note: if you are wondering about the use of the spread operator,
   * it is because we can get SIP messages with things like emojis in them;
   * i.e. UTF8-encoded strings.
   * See https://mathiasbynens.be/notes/javascript-unicode#other-grapheme-clusters for background
   */
  parseMessageHeader(msg, hashPosition, obj) {
    var len = parseInt(msg.slice(0, hashPosition)) ;
    if (isNaN(len)) { throw new Error('invalid length for message: ' + msg) ; }

    obj.incomingMsgLength = len ;
    const start = ++hashPosition;
    const end = start + len ;
    obj.incomingMsg += [...msg].slice(start, end).join('') ;
    msg = [...msg].length === (end + 1) ? '' : [...msg].slice(hashPosition + len).join('') ;
    return msg ; //return remainder to use for next message
  }


  _onData(socket, msg) {
    this._logger(`<===${CRLF}${msg}${CRLF}`) ;

    if (!this.mapIncomingMsg.has(socket)) {
      this.mapIncomingMsg.set(socket, {
        incomingMsg: '',
        length: -1
      });
    }
    const obj = this.mapIncomingMsg.get(socket) ;
    try {
      while ([...msg].length > 0) {
        let pos ;
        if (0 === obj.incomingMsg.length) {
          //waiting for a new message
          pos = msg.indexOf('#') ;
          if (-1 === pos) {
            if (msg.match(/^\d+$/)) {
              //it can happen that a message is broken between the length digits and '#'
              obj.incomingMsg = msg ;
              obj.incomingMsgLength = -1 ;  //unknown
              return ;
            }
            else {
              throw new Error(`invalid message from server, did not start with length#: ${msg}`) ;
            }
          }
          msg = this.parseMessageHeader(msg, pos, obj);
        }
        else if (-1 === obj.incomingMsgLength) {
          //got a length fragment last time
          obj.incomingMsg += msg ;
          pos = msg.indexOf('#') ;
          if (-1 === pos) {
            //cant split twice in a length fragment
            throw new Error(`invalid message from server, did not start with length#: ${msg}`) ;
          }
          msg = this.parseMessageHeader(msg, pos, obj) ;
        }
        else {
          //got a fragment last time
          var remainderSize = obj.incomingMsgLength - [...obj.incomingMsg].length ;
          obj.incomingMsg += msg.slice(0, remainderSize) ;
          msg = msg.slice(remainderSize) ;
        }

        //if we've got a full message, process it
        if ([...obj.incomingMsg].length === obj.incomingMsgLength) {
          debug(`WireProtocol#_onData: got message ${obj.incomingMsg}`);
          this.emit('msg', socket, obj.incomingMsg) ;
          obj.incomingMsg = '' ;
          obj.incomingMsgLength = -1;
        }
      }
    } catch (err) {
      if (this.isServer) {
        console.error(`invalid client message, closing socket: ${err}`);
        this.disconnect(socket);
      } else {
        throw err;
      }
    }

  }

  disconnect(socket) {
    this.closing = true ;
    this.mapIncomingMsg.delete(socket);
    if (!socket) { throw new Error('socket is not connected or was not provided') ; }
    socket.end() ;
  }

  close(callback) {
    assert.ok(this.isServer, 'WireProtocol#close only valid in outbound connection (server) mode');
    this.server.close(callback) ;
  }

} ;
