"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const events_1 = require("events");
const net_1 = __importDefault(require("net"));
const tls_1 = __importDefault(require("tls"));
const uuid_random_1 = __importDefault(require("uuid-random"));
const debug_1 = __importDefault(require("debug"));
const noop = () => { };
const assert_1 = __importDefault(require("assert"));
const log = (0, debug_1.default)('drachtio:agent');
const CRLF = '\r\n';
const DEFAULT_PING_INTERVAL = 15000;
const MIN_PING_INTERVAL = 5000;
const MAX_PING_INTERVAL = 300000;
/**
 * Internal class that handles the low-level TCP/TLS socket communication
 * with the drachtio server, including message framing and keep-alives.
 * @internal
 */
class WireProtocol extends events_1.EventEmitter {
    _logger;
    mapIncomingMsg;
    enablePing;
    pingInterval;
    mapTimerPing;
    server;
    host;
    port;
    reconnectOpts;
    reconnectVars;
    socket;
    closing;
    constructor(opts) {
        super();
        this._logger = opts.logger || noop;
        this.mapIncomingMsg = new Map();
        this.enablePing = false;
        this.pingInterval = DEFAULT_PING_INTERVAL;
        this.mapTimerPing = new Map();
    }
    connect(opts) {
        let socket;
        assert_1.default.ok(typeof this.server === 'undefined', 'WireProtocol#connect: cannot be both client and server');
        this.host = opts.host;
        this.port = opts.port;
        this.reconnectOpts = opts.reconnect || {};
        this.reconnectVars = {};
        this.initializeRetryVars();
        this._evalPingOpts(opts);
        if (opts.tls) {
            log(`wp connecting (tls) to ${this.host}:${this.port}`);
            socket = tls_1.default.connect(opts.port, opts.host, opts.tls, () => {
                log(`tls socket connected: ${socket.authorized}`);
            });
        }
        else {
            log(`wp connecting (tcp) to ${this.host}:${this.port}`);
            socket = net_1.default.connect({
                port: opts.port,
                host: opts.host
            });
        }
        socket.setNoDelay(true);
        socket.setKeepAlive(true);
        this.installListeners(socket);
    }
    _evalPingOpts(opts) {
        if (opts.enablePing === true) {
            this.enablePing = true;
            if (opts.pingInterval) {
                const interval = parseInt(opts.pingInterval);
                assert_1.default.ok(interval >= MIN_PING_INTERVAL, `Srf#connect: opts.pingInterval must be greater than or equal to ${MIN_PING_INTERVAL}`);
                assert_1.default.ok(interval <= MAX_PING_INTERVAL, `Srf#connect: opts.pingInterval must be less than or equal to ${MAX_PING_INTERVAL}`);
                this.pingInterval = interval;
            }
        }
    }
    startPinging(socket) {
        if (!this.enablePing)
            return;
        assert_1.default.ok(!this.mapTimerPing.has(socket), 'duplicate call to startPinging for this socket');
        const timerPing = setInterval(() => {
            if (socket && !socket.destroyed) {
                const msgId = this.send(socket, 'ping');
                this.emit('ping', { msgId, socket });
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
        assert_1.default.ok(typeof this.reconnectOpts === 'undefined', 'WireProtocol#listen: cannot be both server and client');
        this._evalPingOpts(opts);
        let useTls = false;
        if (opts.server instanceof net_1.default.Server) {
            this.server = opts.server;
        }
        else if (opts.tls) {
            useTls = true;
            this.server = tls_1.default.createServer(opts.tls);
            this.server.listen(opts.port, opts.host);
        }
        else {
            this.server = net_1.default.createServer();
            this.server.listen(opts.port, opts.host);
        }
        this.server.on('listening', () => {
            log(`wp listening on ${JSON.stringify(this.server?.address())} for ${useTls ? 'tls' : 'tcp'} connections`);
            this.emit('listening');
        });
        if (useTls) {
            this.server.on('secureConnection', (socket) => {
                log('wp tls handshake succeeded');
                socket.setKeepAlive(true);
                this.installListeners(socket);
                this.emit('connection', socket);
            });
        }
        else {
            this.server.on('connection', (socket) => {
                log(`wp received connection from ${socket.remoteAddress}:${socket.remotePort}`);
                socket.setKeepAlive(true);
                this.installListeners(socket);
                this.emit('connection', socket);
            });
        }
        return this.server;
    }
    get isServer() {
        return !!this.server;
    }
    get isClient() {
        return !this.isServer;
    }
    setLogger(logger) {
        this._logger = logger;
    }
    removeLogger() {
        this._logger = function () { };
    }
    installListeners(socket) {
        socket.on('error', (err) => {
            log(`wp#on error - ${err} ${this.host}:${this.port}`);
            if (this.enablePing)
                this._stopPinging(socket);
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
            if (this.enablePing)
                this._stopPinging(socket);
            if (this.isClient) {
                this._onConnectionGone();
            }
            this.mapIncomingMsg.delete(socket);
            this.emit('close', socket);
        });
        socket.on('data', this._onData.bind(this, socket));
    }
    initializeRetryVars() {
        (0, assert_1.default)(this.isClient);
        this.reconnectVars.retryTimer = null;
        this.reconnectVars.retryTotaltime = 0;
        this.reconnectVars.retryDelay = 150;
        this.reconnectVars.retryBackoff = 1.7;
        this.reconnectVars.attempts = 1;
    }
    _onConnectionGone() {
        (0, assert_1.default)(this.isClient);
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
        }
        else {
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
            this.socket = net_1.default.connect({
                port: this.port,
                host: this.host
            });
            this.socket.setKeepAlive(true);
            this.installListeners(this.socket);
            this.reconnectVars.retryTimer = null;
        }, this.reconnectVars.retryDelay);
    }
    send(socket, msg) {
        const msgId = (0, uuid_random_1.default)();
        const s = msgId + '|' + msg;
        socket.write(Buffer.byteLength(s, 'utf8') + '#' + s, () => {
            log(`wp#send ${this.host}:${this.port} - ${s.length}#${s}`);
        });
        this._logger('===>' + CRLF + Buffer.byteLength(s, 'utf8') + '#' + s + CRLF);
        return msgId;
    }
    _onData(socket, msg) {
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
                else
                    throw err;
            }
            const start = index + 1;
            const byteLength = obj.incomingMsg.length;
            const totalSize = start + messageSize;
            if (byteLength < totalSize)
                return;
            const messageString = obj.incomingMsg.toString('utf8', start, totalSize);
            try {
                this.emit('msg', socket, messageString);
            }
            catch (err) {
                if (this.isServer) {
                    console.error(`invalid client message, closing socket: ${err}`);
                    this.disconnect(socket);
                    return;
                }
                else
                    throw err;
            }
            obj.incomingMsg = obj.incomingMsg.subarray(totalSize);
            index = obj.incomingMsg.indexOf('#');
        }
    }
    disconnect(socket) {
        this.closing = true;
        this.mapIncomingMsg.delete(socket);
        if (!socket) {
            throw new Error('socket is not connected or was not provided');
        }
        this._stopPinging(socket);
        socket.end();
    }
    close(callback) {
        assert_1.default.ok(this.isServer, 'WireProtocol#close only valid in outbound connection (server) mode');
        this.server?.close(callback);
    }
}
module.exports = WireProtocol;
