import { EventEmitter as Emitter } from 'events';
import debug from 'debug';
import WireProtocol from './wire-protocol';
import SipMessage from './sip-parser/message';
import Request from './request';
import Response from './response';
import DigestClient from './digest-client';
import noop from 'node-noop';
import assert from 'assert';
import net from 'net';
import delegate from 'delegates';
import tls from 'tls';

const log = debug('drachtio:agent');
const debugSocket = debug('drachtio:socket');

const CR = '\r';
const CRLF = '\r\n';

const defer = typeof setImmediate === 'function' ?
  setImmediate : function(fn: any, ...args: any[]) { process.nextTick(fn.bind(fn, ...args)); };

function typeSocket(socket: any): boolean {
  return socket instanceof net.Socket || socket instanceof tls.TLSSocket;
}
function sockPort(socket: any): string {
  assert(typeSocket(socket));
  return '' + socket.remotePort + ':' + socket.localPort;
}

function serverVersionAtLeast(serverVersion: string | null, minSupportedVersion: string): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  if (serverVersion) {
    try {
      const regex = /^v(\d+)\.(\d+)\.(\d+)/;
      const actual = regex.exec(serverVersion);
      if (actual) {
        const desired = regex.exec(minSupportedVersion);
        if (desired) {
          log(`parsed serverVersion: ${JSON.stringify(actual)}, desired is ${JSON.stringify(desired)}`);
          if (parseInt(actual[1]) > parseInt(desired[1])) return true;
          if (parseInt(actual[1]) < parseInt(desired[1])) return false;
          if (parseInt(actual[2]) > parseInt(desired[2])) return true;
          if (parseInt(actual[2]) < parseInt(desired[2])) return false;
          if (parseInt(actual[3]) >= parseInt(desired[3])) return true;
        }
        else assert.ok(false, `failed parsing desired ${minSupportedVersion}`);
      }
      else assert.ok(false, `failed parsing actual ${serverVersion}, please fix`);
    } catch {
      //console.log(`Error parsing server version: ${serverVersion}: ${err}, please fix`);
    }
  }
  return false;
}

class DrachtioAgent extends Emitter {
  puntUpTheMiddleware: any;
  params: Map<string, any>;
  mapServer: Map<any, any>;
  verbs: Map<string, any>;
  cdrHandlers: Map<string, any>;
  pendingSipAuthTxnIdUpdate: Map<string, any>;
  _listen: boolean;
  secret?: string;
  tags?: string[];
  wp?: any;

  constructor(callback: any) {
    super();

    this.puntUpTheMiddleware = callback;
    this.params = new Map();

    this.mapServer = new Map();
    this.verbs = new Map();
    this.cdrHandlers = new Map();

    //map of stack transaction ids => pending requests, where txn id for request has been challenged
    this.pendingSipAuthTxnIdUpdate = new Map();

    this._listen = false;
  }

  get isListening(): boolean {
    return this._listen;
  }

  get idle(): boolean {
    let pendingCount = 0;
    let pendingSipCount = 0;
    let pendingAckOrPrack = 0;

    this.mapServer.forEach((obj) => {
      pendingCount += obj.pendingRequests.size;
      pendingSipCount += obj.pendingSipRequests.size;
      pendingAckOrPrack += obj.pendingAckOrPrack.size;

      if (pendingCount > 0) {
        log(`count of pending requests: ${pendingCount}`);
        for (const key of obj.pendingRequests.keys()) {
          log(key);
        }
      }
      if (pendingSipCount > 0) {
        log(`count of pending sip requests: ${pendingSipCount}`);
        for (const key of obj.pendingSipRequests.keys()) {
          log(key);
        }
      }
      if (pendingAckOrPrack > 0) {
        log(`count of pending ack/prack: ${pendingAckOrPrack}`);
        for (const key of obj.pendingAckOrPrack.keys()) {
          log(key);
        }
      }
    });

    log(`idle check: ${pendingCount + pendingSipCount + pendingAckOrPrack}`);
    return (pendingCount + pendingSipCount + pendingAckOrPrack) === 0;
  }

  connect(opts: any, callback?: any): void {
    this.secret = opts.secret;
    this.tags = opts.tags || [];

    this.wp = new WireProtocol(opts);
    this.wp.connect(opts);

    // pass on some of the socket events
    ['reconnecting', 'close', 'error'].forEach((evt) => {
      this.wp.on(evt, (...args: any[]) => {
        this.emit(evt, ...args);
      });
    });

    this.wp.on('connect', this._onConnect.bind(this));
    this.wp.on('close', this._onClose.bind(this));
    this.wp.on('msg', this._onMsg.bind(this));

    if (callback) {
      this.on('connect', callback);
    }
  }

  listen(opts: any, callback?: any): any {
    this.secret = opts.secret;
    this.tags = opts.tags || [];

    this._listen = true;
    this.wp = new WireProtocol(opts);
    const server = this.wp.listen(opts);

    delegate(this, 'wp')
      .method('close');

    // pass on some of the socket events
    ['reconnecting', 'close', 'error', 'listening'].forEach((evt) => {
      this.wp.on(evt, (...args: any[]) => {
        this.emit(evt, ...args);
      });
    });

    this.wp.on('close', this._onClose.bind(this));
    this.wp.on('connection', this._onConnect.bind(this));
    this.wp.on('msg', this._onMsg.bind(this));

    if (callback) {
      this.on('listening', callback);
    }

    return server;
  }

  on(event: string | symbol, fn?: any): this {
    if (typeof event === 'string' && event.indexOf('cdr:') === 0) {
      this.cdrHandlers.set(event.slice(4), fn);
      this.route(event);
    }
    else if (event === 'ping') {
      const {msgId, socket} = fn;
      const obj = this.mapServer.get(socket);
      if (obj) {
        log(`sent ping request with msgId ${msgId}`);
        obj.pendingPingRequests.add(msgId);
      }
    }
    else {
      super.on(event, fn);
    }
    return this;
  }

  sendMessage(socket: any, msg: any, opts?: any): string {
    if (!typeSocket(socket)) {
      opts = msg;
      msg = socket;
      socket =  this._getDefaultSocket();
    }

    log(`sendMessage: ${msg}`);
    let m = msg;
    opts = opts || {};

    log(`opts: ${JSON.stringify(opts)}`);

    if (opts && (opts.headers || opts.body)) {
      m = new SipMessage(msg);
      for (const hdr in (opts.headers || {})) {
        m.set(hdr, opts.headers[hdr]);
      }
      if (opts.body) { m.body = opts.body; }
    }

    const s = `sip|${opts.stackTxnId || ''}|${opts.stackDialogId || ''}${CRLF}${m.toString()}`;

    return this.wp.send(socket, s);
  }

  _normalizeParams(socket: any, uri: any, options: any, callback: any): any {
    if (!typeSocket(socket)) {
      callback = options;
      options = uri;
      uri = socket;
      socket = null;
    }

    if (typeof uri === 'undefined') {
      const err = new Error('undefined is not a valid request_uri or options object.');
      console.error(err.stack);
      throw err;
    }

    if (options && typeof options === 'object') {
      options.uri = uri;
    }
    else if (typeof uri === 'string') {
      options = {uri: uri};
    }
    else {
      callback = options;
      options = uri;
      uri = options.uri;
    }
    callback = callback || noop;

    if (options._socket) {
      debugSocket(`_normalizeParams: using socket provided in options._socket: ${sockPort(options._socket)}`);
      socket = options._socket;
      delete options._socket;
    }
    else {
      socket = this._getDefaultSocket();
      debugSocket(`_normalizeParams: using default socket provided in options._socket: ${sockPort(socket)}`);
    }

    log(`options: ${JSON.stringify(options)}`);
    options.method = options.method.toUpperCase();

    return { socket, uri, options, callback };
  }

  _makeRequest(params: any): void {
    debugSocket(`_makeRequest: there are ${this.mapServer.size} entries in mapServer`);
    const obj = this.mapServer.get(params.socket);

    if (!params.options.uri && !!params.options.stackDialogId) {
      params.options.uri = 'sip:placeholder';
    }

    const m = new SipMessage(params.options);

    let msg = `sip|${params.options.stackTxnId || ''}|${params.options.stackDialogId || ''}`;
    if (params.options.proxy) {
      msg += `|${params.options.proxy}`;
    }
    msg += `${CRLF}${m.toString()}`;

    debugSocket(`_makeRequest: calling wp.send using socket ${sockPort(params.socket)}`);

    if (!typeSocket(params.socket)) {
      const err = new Error('provided socket is not a net.Socket or tls.TLSSocket');
      return params.callback(err);
    }

    if (params.socket.destroyed === true) {
      const err = new Error('provided socket has been destroyed');
      return params.callback(err);
    }

    const msgId = this.wp.send(params.socket, msg);

    obj.pendingRequests.set(msgId, (token: string[], msgStr: string) => {
      if (token[0] === 'OK') {
        const transactionId = token[7];
        const meta = {
          source: token[1],
          address: token[4],
          port: token[5],
          protocol: token[3],
          time: token[6],
          transactionId: transactionId
        };

        const req: any = new Request(new SipMessage(msgStr), meta);
        req.agent = this;
        req.socket = obj.socket;
        if (params.options.auth) {
          req.auth = params.options.auth;
          req._originalParams = params;
        }

        if (params.options.method !== 'CANCEL') {
          obj.pendingSipRequests.set(transactionId, { req });
        }

        params.callback(null, req);

      }
      else {
        const err = new Error(token[1] || 'request failed');
        params.callback(err);
      }
    });
  }

  request(socket: any, request_uri?: any, options?: any, callback?: any): any {
    const params = this._normalizeParams(socket, request_uri, options, callback);

    if (params.options && params.options.stackTxnId) {
      if (this.pendingSipAuthTxnIdUpdate.has(params.options.stackTxnId)) {
        log(`uac-auth: holding ${params.options.method} for ${params.options.stackTxnId} that is being replaced`);
        this.pendingSipAuthTxnIdUpdate.set(params.options.stackTxnId, params);
        return;
      }
    }
    return this._makeRequest(params);
  }
  
  uac(socket: any, request_uri?: any, options?: any, callback?: any): any {
    return this.request(socket, request_uri, options, callback);
  }

  sendResponse(res: any, opts?: any, callback?: any, fnAck?: any): void {
    const obj = this.mapServer.get(res.socket);
    log(`agent#sendResponse: ${JSON.stringify(res.msg)}`);
    if (!obj) {
      callback && callback(new Error('drachtio-agent:sendResponse: socket connection closed'));
      return;
    }
    const msgId = this.sendMessage(res.socket, res.msg, Object.assign({stackTxnId: res.req.stackTxnId}, opts));
    if ((callback && typeof callback === 'function') || fnAck) {
      obj.pendingRequests.set(msgId, (token: string[], msgStr: string, meta: any) => {
        obj.pendingRequests.delete(msgId);
        if ('OK' !== token[0]) { if (callback) return callback(token[1]); return; }
        const responseMsg = new SipMessage(msgStr);
        res.meta = meta;
        if (callback) {
          callback(null, responseMsg);
        }

        if (fnAck && typeof fnAck === 'function' &&
          (responseMsg.has('RSeq') || res.status === 200)) {
          obj.pendingAckOrPrack.set(meta.dialogId, fnAck);
        }
      });
    }
    if (res.statusCode >= 200) {
      defer(() => {
        res.finished = true;
        res.emit('finish');
      });

      if (res.req.method === 'INVITE') {
        const callId = res.get('call-id');
        obj.pendingNetworkInvites.delete(callId);
        log(`Agent#sendResponse: deleted pending invite for call-id ${callId}, ` +
          `there are now ${obj.pendingNetworkInvites.size} pending invites`);
      }
    }
  }

  sendAck(method: string, dialogId: string, req: any, res: any, opts: any, callback: any): void {
    assert(this.mapServer.has(res.socket));
    const obj = this.mapServer.get(res.socket);
    const m = new SipMessage();
    m.method = method;
    m.uri = req.uri;
    opts = opts || {};

    Object.assign(opts, {stackDialogId: dialogId});

    const msgId = this.sendMessage(res.socket, m, opts);
    if (callback) {
      obj.pendingRequests.set(msgId, (token: string[], msgStr: string) => {
        if ('OK' !== token[0]) {
          return callback(token[1]);
        }
        callback(null, new SipMessage(msgStr));
      });
    }
  }

  proxy(req: any, opts: any, callback: any): void {
    const obj = this.mapServer.get(req.socket);

    const m = new SipMessage({
      uri: opts.destination[0],
      method: req.method
    });

    if (opts.headers) {
      for (const hdr in (opts.headers || {})) {
        m.set(hdr, opts.headers[hdr]);
      }
    }

    const msg = `proxy|${opts.stackTxnId}|${(opts.remainInDialog ? 'remainInDialog' : '')}` +
    `|${(opts.fullResponse ? 'fullResponse' : '')}|${(opts.followRedirects ? 'followRedirects' : '')}` +
    `|${(opts.simultaneous ? 'simultaneous' : 'serial')}|${opts.provisionalTimeout}|${opts.finalTimeout}` +
    `|${opts.destination.join('|')}${CRLF}${m.toString()}`;

    const msgId = this.wp.send(req.socket, msg);
    obj.pendingRequests.set(msgId, callback);

    obj.pendingNetworkInvites.delete(req.get('Call-Id'));
    log(`proxying call, pendingNetworkInvites size is now ${obj.pendingNetworkInvites.size}`);
  }

  set(prop: string, val: any): void {
    switch (prop) {
      case 'handler':
        this.puntUpTheMiddleware = val;
        break;
      default:
        this.params.set(prop, val);
        break;
    }
  }

  get(prop: string): any {
    return this.params.get(prop);
  }

  route(verb: string): void {
    if (this.verbs.has(verb)) { throw new Error('duplicate route request for ' + verb); }
    this.verbs.set(verb, { sent: false });

    this.mapServer.forEach((obj, socket) => {
      if (obj.authenticated) {
        this.routeVerbs(socket);
      }
    });
  }

  routeVerbs(socket: any): void {
    this.verbs.forEach((obj, verb) => {
      if (obj.sent === true) {
        return;
      }
      this.verbs.set(verb, {
        sent: true,
        acknowledged: false,
        rid: this.wp.send(socket, 'route|' + verb)
      });
    });
  }

  removeRoute(verb: string): void {
    if (!this.verbs.has(verb)) { throw new Error('no route request to remove for ' + verb); }

    this.mapServer.forEach((obj, socket) => {
      if (obj.authenticated) {
        this.wp.send(socket, 'remove_route|' + verb);
        this.verbs.delete(verb);
      }
    });
  }

  disconnect(socket?: any): void {
    const sock = socket || this._getDefaultSocket();
    debugSocket(`disconnect: removing socket ${sockPort(sock)}`);
    this.wp.disconnect(sock);
    if (socket) {
      this.mapServer.delete(socket);
      debugSocket(`disconnect: after delete there are ${this.mapServer.size} entries in mapServer`);
    }
  }

  close(): void {
    this.wp.close();
  }

  _getDefaultSocket(): any {
    debugSocket(`_getDefaultSocket: there are ${this.mapServer.size} entries in mapServer`);
    const socket = this.mapServer.keys().next().value;
    debugSocket(`_getDefaultSocket: returning socket ${socket ? sockPort(socket) : 'null'}`);
    return socket;
  }

  _initServer(socket: any): any {
    assert(!this.mapServer.has(socket));
    this.mapServer.set(socket, {
      pendingPingRequests: new Set(),
      pendingRequests: new Map(),
      pendingSipRequests: new Map(),
      pendingSipAuthRequests: new Map(),
      pendingNetworkInvites: new Map(),
      pendingAckOrPrack: new Map(),
      authenticated: false,
      ready: false,
      hostport: null
    });
    debugSocket(`_initServer: added socket: ${sockPort(socket)}, count now: ${this.mapServer.size}`);
    return this.mapServer.get(socket);
  }

  _onConnect(socket: any): void {
    const obj = this._initServer(socket);
    const msgId = this.wp.send(socket, `authenticate|${this.secret}|${this.tags?.join(',')}`);
    obj.pendingRequests.set(msgId, (response: string[]) => {
      obj.authenticated = ('OK' === response[0]);
      if (obj.authenticated) {
        obj.ready = true;
        obj.hostport = response[1];
        obj.serverVersion = response.length > 2 ? response[2] : null;
        obj.localHostports = response.length > 3 ? response[3] : null;
        log('sucessfully authenticated, hostport is ', obj.hostport);

        if (this.wp.isClient) {
          this.routeVerbs(socket);
          setImmediate(() => {
            this.emit('connect', null, obj.hostport, obj.serverVersion, obj.localHostports);
          });
        }
        else {
          this.emit('connect', null, obj.hostport, obj.serverVersion, obj.localHostports);
        }
        if (serverVersionAtLeast(obj.serverVersion, 'v0.8.2')) {
          log(`server version ${obj.serverVersion} supports pinging`);
          this.wp.startPinging(socket);
        }
      }
      else {
        this.emit('connect', new Error('failed to authenticate to server'));
      }
    });
  }

  _onClose(socket: any): void {
    this.mapServer.delete(socket);
    debugSocket(`_initServer: removed socket: ${sockPort(socket)}, count now: ${this.mapServer.size}`);
  }

  _onMsg(socket: any, msg: string): void {
    const obj = this.mapServer.get(socket);
    const pos = msg.indexOf(CR);
    const leader = -1 === pos ? msg : msg.slice(0, pos);
    const token = leader.split('|');
    let res: any, sr: any, rawMsg = '';

    switch (token[1]) {
      case 'sip': {
        let sipMsg: any;
        if (!obj) {
          log('socket not found, message discarding');
          return;
        }
        rawMsg = msg.slice(pos + 2);
        try {
          sipMsg = new SipMessage(rawMsg);
        } catch(err) {
          console.error(err, `unable to parse incoming message: ${rawMsg}`);
          return;
        }
        const source = token[2];
        const protocol = token[4];
        const address = token[5];
        const port = token[6];
        const time = token[7];
        const transactionId = token[8];
        const dialogId = token[9];
        const server = {
          address: socket.remoteAddress,
          hostport: obj.hostport
        };
        let receivedOn: string | undefined;
        if (token.length > 11) {
          receivedOn = token[10] + ':' + token[11];
        }
        let sessionToken: string | undefined;
        if (token.length > 12) {
          sessionToken = token[12];
        }
        const meta = {source, address, port, protocol, time, transactionId, dialogId, server, receivedOn, sessionToken};
        log(`tokens: ${JSON.stringify(token)}`);

        if (token.length > 9) {
          const callId = sipMsg.get('call-id');

          if ('network' === source && sipMsg.type === 'request') {
            if ('CANCEL' === sipMsg.method) {
              if (obj.pendingNetworkInvites.has(callId)) {
                obj.pendingNetworkInvites.get(callId).req.emit('cancel', sipMsg);
                obj.pendingNetworkInvites.delete(callId);
                log(`Agent#handle - emitted cancel event for INVITE with call-id ${callId}` +
                  `, remaining count of invites in progress: ${obj.pendingNetworkInvites.size}`);
              }
              else {
                log(`Agent#handle - got CANCEL for call-id ${callId} that was not found`);
              }
              return;
            }

            log(`DrachtioAgent#_onMsg: meta: ${JSON.stringify(meta)}`);

            const req: any = new Request(sipMsg, meta);
            res = new Response();
            req.res = res;
            res.req = req;
            req.agent = res.agent = this;
            req.socket = res.socket = socket;

            if ('INVITE' === req.method) {
              obj.pendingNetworkInvites.set(callId, { req, res });
              log(`Agent#handle: tracking an incoming invite with call-id ${callId}, ` +
                `currently tracking ${obj.pendingNetworkInvites.size} invites in progress`);
            }
            else if (('PRACK' === req.method || 'ACK' === req.method) && obj.pendingAckOrPrack.has(dialogId)) {
              const fnAck = obj.pendingAckOrPrack.get(dialogId);
              obj.pendingAckOrPrack.delete(dialogId);
              fnAck(req);
            }
            else if ('UPDATE' === req.method && obj.pendingNetworkInvites.has(callId)) {
              const inviteReq = obj.pendingNetworkInvites.get(callId).req;
              if (inviteReq.listenerCount('update') > 0) {
                inviteReq.emit('update', req, res);
                log(`Agent#handle - emitted update event for INVITE with call-id ${callId}`);
                return;
              }
              else {
                res.send(500, {
                  headers: {
                    'Retry-After': '5'
                  }
                });
                log(`Agent#handle - no listeners for update event for INVITE with call-id ${callId}`);
                return;
              }
            }
            else if ('UPDATE' === req.method) {
              obj.pendingSipRequests.forEach((value: any, _key: string) => {
                if (value.req.get('call-id') === callId) {
                  log(`Agent#handle - found pending sip request with call-id ${callId} and key ${_key}`);
                  sr = value;
                }
              });
              if (sr) {
                log(`Agent#handle - got UPDATE for UAC INVITE with call-id ${callId}`);
                sr.req.emit('update', req, res);
                return;
              }
            }

            this.puntUpTheMiddleware(req, res);
          }
          else if ('network' === source) {
            log('received sip response');
            if (obj.pendingSipRequests.has(transactionId)) {
              sr = obj.pendingSipRequests.get(transactionId);
              res = new Response(this);
              res.msg = sipMsg;
              res.meta = meta;
              res.req = sr.req;
              res.socket = res.req.socket = socket;

              log('Agent#handle: got a response with status: %d', res.status);

              if (res.status >= 200) {
                obj.pendingSipRequests.delete(transactionId);
              }

              let ack = noop;
              if (res.status >= 200 && res.req.method === 'INVITE') {
                ack = res.sendAck.bind(res, token[9]);
              }
              else if (res.status > 100 && res.status < 200) {
                const prackNeeded = res.get('RSeq');
                if (prackNeeded && typeof res.sendPrack === 'function') {
                  ack = res.sendPrack.bind(res, token[9]);
                }
              }
              const cid = res.msg.headers['call-id'];
              if (obj.pendingSipAuthRequests.has(cid)) {
                obj.pendingSipAuthRequests.delete(cid);
                this.pendingSipAuthTxnIdUpdate.delete(res.req.stackTxnId);
              }
              else if ((401 === res.status || 407 === res.status) && (!!res.req.auth)) {
                obj.pendingSipAuthRequests.set(cid, true);
                this.pendingSipAuthTxnIdUpdate.set(res.req.stackTxnId, {});
                const client = new DigestClient(res);
                client.authenticate((err: any, authReq: any) => {
                  if (!authReq) {
                    sr.req.emit('response', res, ack);
                    return;
                  }
                  res.req.listeners('response').forEach((l: any) => { authReq.on('response', l); });
                  res.req.emit('authenticate', authReq);

                  const params = this.pendingSipAuthTxnIdUpdate.get(res.req.stackTxnId);
                  if (params && params.options && params.options.stackTxnId) {
                    log(`uac-auth: sending out delayed ${params.options.method} originally for ${res.req.stackTxnId}`);
                    params.options.stackTxnId = authReq.stackTxnId;
                    this._makeRequest(params);
                  }
                  this.pendingSipAuthTxnIdUpdate.delete(res.req.stackTxnId);

                  log(`uac-auth: new transaction ${authReq.stackTxnId} overwrites ${res.req.stackTxnId}`);
                  res.req.stackTxnId = authReq.stackTxnId;
                });
                return;
              }
              sr.req.emit('response', res, ack);
            }
          }
          else if ('application' === source && sipMsg.type === 'request' && transactionId === 'unsolicited') {
            log('received unsolicited request sent from application; probably BYE due to ACK timeout or the like');
            const req: any = new Request(sipMsg, meta);
            res = new Response();
            req.res = res;
            res.req = req;
            req.agent = res.agent = this;
            req.socket = res.socket = socket;

            res.send = noop;

            this.puntUpTheMiddleware(req, res);
          }
        }

        break;
      }

      case 'response': {
        if (!obj) {
          log('socket not found, message discarding');
          return;
        }
        const rId = token[2];

        if (obj.pendingPingRequests.has(rId)) {
          obj.pendingPingRequests.delete(rId);
          log(`got pong response with msgId ${rId}, count outstanding: ${obj.pendingPingRequests.size}`);
        }
        else if (obj.pendingRequests.has(rId)) {
          if (-1 !== pos) { rawMsg = msg.slice(pos + 2); }
          const meta2 = {
            source: token[4],
            address: token[7],
            port: token[8],
            protocol: token[6],
            time: token[9],
            transactionId: token[10],
            dialogId: token[11]
          };
          const fn = obj.pendingRequests.get(rId).bind(this, token.slice(3), rawMsg, meta2);
          if ('continue' !== token[12]) {
            obj.pendingRequests.delete(rId);
          }
          fn();
        }
        break;
      }

      case 'cdr:attempt':
      case 'cdr:start':
      case 'cdr:stop': {
        const cdrEvent = token[1].slice(4);
        const msgSource = token[2];
        const msgTime = token[3];
        rawMsg = msg.slice(pos + 2);
        const cdrSipMsg = new SipMessage(rawMsg);
        const args: any[] = [msgSource, msgTime];
        if (cdrEvent !== 'attempt') { args.push(token[4]); }
        args.push(cdrSipMsg);

        if (this.cdrHandlers.has(cdrEvent)) {
          this.cdrHandlers.get(cdrEvent).apply(this, args);
        }
        break;
      }

      default:
        throw new Error(`invalid msg type: '${token[1]}', msg: '${msg}'`);
    }
  }
}

export = DrachtioAgent;
