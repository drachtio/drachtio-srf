import { EventEmitter as Emitter } from 'events';
import net from 'net';
import tls from 'tls';
import uuidV4 from 'uuid-random';
import debug from 'debug';
import noop from 'node-noop';
import assert from 'assert';

const log = debug('drachtio:agent');
const CRLF = '\r\n';
const DEFAULT_PING_INTERVAL = 15000;
const MIN_PING_INTERVAL = 5000;
const MAX_PING_INTERVAL = 300000;

class WireProtocol extends Emitter {
  _logger: any;
  mapIncomingMsg: Map<any, any>;
  enablePing: boolean;
  pingInterval: number;
  mapTimerPing: Map<any, any>;
  server?: net.Server | tls.Server;
  host?: string;
  port?: number;
  reconnectOpts?: any;
  reconnectVars?: any;
  socket?: any;
  closing?: boolean;

  constructor(opts: any) {
    super();

    this._logger = opts.logger || noop;
    this.mapIncomingMsg = new Map();

    this.enablePing = false;
    this.pingInterval = DEFAULT_PING_INTERVAL;
    this.mapTimerPing = new Map();
  }

  connect(opts: any): void {
    let socket: any;
    assert.ok(typeof this.server === 'undefined', 'WireProtocol#connect: cannot be both client and server');
    this.host = opts.host;
    this.port = opts.port;
    this.reconnectOpts = opts.reconnect || {};
    this.reconnectVars = {};
    this._evalPingOpts(opts);
    if (opts.tls) {
      log(`wp connecting (tls) to ${this.host}:${this.port}`);
      socket = tls.connect(opts.port, opts.host, opts.tls, () => {
        log(`tls socket connected: ${socket.authorized}`);
      });
    }
    else {
      log(`wp connecting (tcp) to ${this.host}:${this.port}`);
      socket = net.connect({
        port: opts.port,
        host: opts.host
      });
    }
    socket.setNoDelay(true);
    socket.setKeepAlive(true);
    this.installListeners(socket);
  }

  _evalPingOpts(opts: any): void {
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

  startPinging(socket: any): void {
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

  _stopPinging(socket: any): void {
    const timerPing = this.mapTimerPing.get(socket);
    if (timerPing) {
      clearInterval(timerPing);
      this.mapTimerPing.delete(socket);
    }
  }

  listen(opts: any): net.Server | tls.Server {
    assert.ok(typeof this.reconnectOpts === 'undefined', 'WireProtocol#listen: cannot be both server and client');
    this._evalPingOpts(opts);

    let useTls = false;
    if (opts.server instanceof net.Server) {
      this.server = opts.server;
    }
    else if (opts.tls) {
      useTls = true;
      this.server = tls.createServer(opts.tls);
      this.server.listen(opts.port, opts.host);
    }
    else {
      this.server = net.createServer();
      this.server.listen(opts.port, opts.host);
    }
    this.server!.on('listening', () => {
      log(`wp listening on ${JSON.stringify(this.server?.address())} for ${useTls ? 'tls' : 'tcp'} connections`);
      this.emit('listening');
    });

    if (useTls) {
      this.server!.on('secureConnection', (socket: any) => {
        log('wp tls handshake succeeded');
        socket.setKeepAlive(true);
        this.installListeners(socket);
        this.emit('connection', socket);
      });
    }
    else {
      this.server!.on('connection', (socket: any) => {
        log(`wp received connection from ${socket.remoteAddress}:${socket.remotePort}`);
        socket.setKeepAlive(true);
        this.installListeners(socket);
        this.emit('connection', socket);
      });
    }
    return this.server!;
  }

  get isServer(): boolean {
    return !!this.server;
  }

  get isClient(): boolean {
    return !this.isServer;
  }

  setLogger(logger: any): void {
    this._logger = logger;
  }
  removeLogger(): void {
    this._logger = function() {};
  }

  installListeners(socket: any): void {
    socket.on('error', (err: any) => {
      log(`wp#on error - ${err} ${this.host}:${this.port}`);
      if (this.enablePing) this._stopPinging(socket);

      if (this.isServer || this.closing) {
        return;
      }

      this.emit('error', err, socket);

      this._onConnectionGone();
    });

    socket.on('connect', () => {
      log(`wp#on connect ${this.host}:${this.port}`);
      if (this.isClient) {
        this.initializeRetryVars();
      }
      this.emit('connect', socket);
    });

    socket.on('close', () => {
      log(`wp#on close ${this.host}:${this.port}`);
      if (this.enablePing) this._stopPinging(socket);
      if (this.isClient) {
        this._onConnectionGone();
      }
      this.mapIncomingMsg.delete(socket);
      this.emit('close', socket);
    });

    socket.on('data', this._onData.bind(this, socket));
  }

  initializeRetryVars(): void {
    assert(this.isClient);

    this.reconnectVars.retryTimer = null;
    this.reconnectVars.retryTotaltime = 0;
    this.reconnectVars.retryDelay = 150;
    this.reconnectVars.retryBackoff = 1.7;
    this.reconnectVars.attempts = 1;
  }

  _onConnectionGone(): void {
    assert(this.isClient);

    if (this.reconnectVars.retryTimer) {
      log('WireProtocol#connection_gone: retry is already in progress');
      return;
    }

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
        port: this.port as number,
        host: this.host as string
      });
      this.socket.setKeepAlive(true);
      this.installListeners(this.socket);

      this.reconnectVars.retryTimer = null;
    }, this.reconnectVars.retryDelay);
  }

  send(socket: any, msg: string): string {
    const msgId = uuidV4();
    const s = msgId + '|' + msg;
    socket.write(Buffer.byteLength(s, 'utf8') + '#' + s, () => {
      log(`wp#send ${this.host}:${this.port} - ${s.length}#${s}`);
    });
    this._logger('===>' + CRLF + Buffer.byteLength(s, 'utf8') + '#' + s + CRLF);
    return msgId;
  }

  _onData(socket: any, msg: Buffer): void {
    if (log.enabled) {
      const strval = msg.toString('utf8');
      this._logger(`<===${CRLF}${strval}${CRLF}`);
      log(`<===${strval}`);
    }

    if (!this.mapIncomingMsg.has(socket)) {
      this.mapIncomingMsg.set(socket, {
        incomingMsg: Buffer.alloc(0),
        length: -1
      });
    }
    const obj = this.mapIncomingMsg.get(socket);

    obj.incomingMsg = Buffer.concat([obj.incomingMsg, msg]);
    let index = obj.incomingMsg.indexOf('#');

    while (index > 0) {
      const messageSize = parseInt(obj.incomingMsg.toString('utf8', 0, index));
      if (messageSize > Number.MAX_SAFE_INTEGER || messageSize == undefined
          || messageSize <= 0 || isNaN(messageSize)) {
        const err = new Error(`invalid message, missing length specifier: '${obj.incomingMsg}'`);
        if (this.isServer) {
          console.error(`invalid client message, closing socket: ${err}`);
          this.disconnect(socket);
          return;
        }
        else throw err;
      }

      const start = index + 1;
      const byteLength = obj.incomingMsg.length;
      const totalSize = start + messageSize;

      if (byteLength < totalSize)
        return;

      const messageString = obj.incomingMsg.toString('utf8', start, totalSize);
      try {
        this.emit('msg', socket, messageString);
      } catch(err) {
        if (this.isServer) {
          console.error(`invalid client message, closing socket: ${err}`);
          this.disconnect(socket);
          return;
        }
        else throw err;
      }

      obj.incomingMsg = obj.incomingMsg.subarray(totalSize);
      index = obj.incomingMsg.indexOf('#');
    }
  }

  disconnect(socket: any): void {
    this.closing = true;
    this.mapIncomingMsg.delete(socket);
    if (!socket) { throw new Error('socket is not connected or was not provided'); }
    this._stopPinging(socket);
    socket.end();
  }

  close(callback?: any): void {
    assert.ok(this.isServer, 'WireProtocol#close only valid in outbound connection (server) mode');
    this.server?.close(callback);
  }
}

export = WireProtocol;
