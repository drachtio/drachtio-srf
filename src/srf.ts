import drachtio from './connect';
import Dialog from './dialog';
import assert from 'assert';
import { EventEmitter as Emitter } from 'events';
import delegate from 'delegates';
import * as parser from './sip-parser/parser';
import methods from 'sip-methods';
import SipError from './sip_error';
import debug from 'debug';
import net from 'net';
import shortUuid from 'short-uuid';
import sdpTransform from 'sdp-transform';
import SipMessage from './sip-parser/message';
import Request from './request';
import Response from './response';

const Socket = net.Socket;
const log = debug('drachtio:srf');
const noop = () => {};
const idgen = shortUuid();

class DialogState {
  static Trying = 'trying';
  static Proceeding = 'proceeding';
  static Early = 'early';
  static Confirmed = 'confirmed';
  static Terminated = 'terminated';
  static Rejected = 'rejected';
  static Cancelled = 'cancelled';
}
class DialogDirection {
  static Initiator = 'initiator';
  static Recipient = 'recipient';
}

import tls from 'tls';

declare namespace Srf {
  export interface CreateUASOptions {
    localSdp?: string | (() => string | Promise<string>);
    headers?: Record<string, string>;
    dialogStateEmitter?: Emitter;
    body?: string | (() => string | Promise<string>);
  }

  export interface CreateUACOptions {
    headers?: Record<string, string>;
    uri?: string;
    noAck?: boolean;
    localSdp?: string;
    proxy?: string;
    auth?: { username: string; password: string; } | ((req: Request, res: Response, callback: any) => void);
    method?: string;
    calledNumber?: string;
    callingNumber?: string;
    callingName?: string;
    followRedirects?: boolean;
    keepUriOnRedirect?: boolean;
    dialogStateEmitter?: Emitter;
    _socket?: net.Socket | tls.TLSSocket;
  }

  export interface CreateB2BUAOptions {
    headers?: Record<string, string>;
    responseHeaders?: Record<string, string> | ((uacRes: any, headers: Record<string, string>) => Record<string, string> | null);
    localSdpA?: string | ((sdp: string, res: Response) => string | Promise<string>);
    localSdpB?: string | ((sdp: string) => string | Promise<string>);
    proxyRequestHeaders?: string[];
    proxyResponseHeaders?: string[];
    passFailure?: boolean;
    passProvisionalResponses?: boolean;
    proxy?: string;
    auth?: { username: string; password: string; } | ((req: Request, res: Response, callback: any) => void);
    uri?: string;
    noAck?: boolean;
    dialogStateEmitter?: Emitter;
    method?: string;
    callingNumber?: string;
    callingName?: string;
    calledNumber?: string;
    localSdp?: string;
    _socket?: any;
  }

  export interface ProxyRequestOptions {
    destination?: string | string[];
    forking?: 'sequential' | 'simultaneous' | 'parallel';
    remainInDialog?: boolean;
    recordRoute?: boolean;
    path?: boolean;
    provisionalTimeout?: string;
    finalTimeout?: string;
    followRedirects?: boolean;
    simultaneous?: boolean;
    fullResponse?: boolean;
  }

  export interface SrfConfig {
    host?: string;
    port?: number;
    secret?: string;
    tls?: any;
    reconnect?: any;
    enablePing?: boolean;
    pingInterval?: string | number;
    tags?: string[];
  }

  export interface ProgressCallbacks {
    cbRequest?: (err: Error | null, req: Request) => void;
    cbProvisional?: (res: Response) => void;
    cbFinalizedUac?: (uac: Dialog) => void;
  }
}

const sleepFor = async(ms: number) => await new Promise((resolve) => setTimeout(resolve, ms));

const noncopyableHdrs = ['via', 'from', 'to', 'call-id', 'cseq', 'contact', 'content-length', 'content-type'];
function copyAllHeaders(headers: any, obj: any) {
  if (headers) Object.keys(headers).forEach((h) => {
    if (!noncopyableHdrs.includes(h) && !obj[h]) obj[h] = headers[h];});
}
function possiblyRemoveHeaders(hdrList: any[], obj: any) {
  hdrList.forEach((h) => {
    const arr = /^-(.*)$/.exec(h);
    if (arr) {
      let hdr = arr[1];
      if (!hdr.startsWith('X-') && hdr !== 'Diversion') hdr = hdr.toLowerCase();
      delete obj[hdr];
    }
  });

}

interface SrfEvents {
  'connect': (err: Error | null, hostport: string, serverVersion?: string, localHostports?: string) => void;
  'error': (err: Error, socket?: any) => void;
  'disconnect': () => void;
  'message': (req: Request, res: Response) => void;
  'request': (req: Request, res: Response) => void;
  'register': (req: Request, res: Response) => void;
  'invite': (req: Request, res: Response) => void;
  'bye': (req: Request, res: Response) => void;
  'cancel': (req: Request, res: Response) => void;
  'ack': (req: Request, res: Response) => void;
  'info': (req: Request, res: Response) => void;
  'notify': (req: Request, res: Response) => void;
  'options': (req: Request, res: Response) => void;
  'prack': (req: Request, res: Response) => void;
  'publish': (req: Request, res: Response) => void;
  'refer': (req: Request, res: Response) => void;
  'subscribe': (req: Request, res: Response) => void;
  'update': (req: Request, res: Response) => void;
  'cdr:attempt': (source: string, time: string, msg: SipMessage) => void;
  'cdr:start': (source: string, time: string, role: string, msg: SipMessage) => void;
  'cdr:stop': (source: string, time: string, reason: string, msg: SipMessage) => void;
  'listening': () => void;
  'reconnecting': () => void;
  'close': () => void;
  [key: string]: (...args: any[]) => void;
}

declare interface Srf {
  on<U extends keyof SrfEvents>(event: U, listener: SrfEvents[U]): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once<U extends keyof SrfEvents>(event: U, listener: SrfEvents[U]): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  off<U extends keyof SrfEvents>(event: U, listener: SrfEvents[U]): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  emit<U extends keyof SrfEvents>(event: U, ...args: Parameters<SrfEvents[U]>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;
}

class Srf extends Emitter {
  _dialogs: Map<string, Dialog>;
  _tags: string[];
  _app: any;
  locals: Record<string, any>;
  [key: string]: any;

  constructor(app?: any) {
    super();

    this._dialogs = new Map();
    this._tags = [];
    this.locals = {};

    if (typeof app === 'function') this._app = app;
    else if (typeof app === 'string') this._tags.push(app);
    else if (Array.isArray(app) && app.every((t) => typeof t === 'string')) this._tags = app;

    assert(this._tags.length <= 20, 'Srf#constructor: only 20 tags may be supplied');
    assert(this._tags.every((t) => t.length <= 32), 'Srf#constructor: tag values must be 32 characters or less');
    assert(this._tags.every((t) => /^[a-zA-Z0-9-_+@:]+$/.test(t)),
      'Srf#constructor: tag values may only contain characters a-zA-Z0-9-_+@:');

    if (!this._app) {
      this._app = drachtio();
      ['connect', 'listening', 'reconnecting', 'error', 'close'].forEach((evt) => {
        this._app.on(evt, (...args: any[]) => setImmediate(() => this.emit(evt, ...args)));
      });

      if (typeof app === 'object' && !Array.isArray(app)) {
        assert.equal(typeof app.host,  'string', 'invalid drachtio connection opts');

        const opts = app;
        this._app.connect(opts);
      }
    }

    this._app.use(this.dialog());
  }

  on(event: string | symbol, fn?: any): this {
    if (typeof event === 'string' && 0 === event.indexOf('cdr:')) {
      return this._app.on(event, fn);
    }

    return super.on(event, fn);
  }

  get app() {
    return this._app;
  }

  connect(opts: any, callback?: any) {
    let args = opts;
    if (this._tags.length) args = Object.assign({}, opts, {tags: this._tags});
    return this.app.connect(args, callback);
  }

  listen(opts: any, callback?: any) {
    if (this._tags.length) Object.assign(opts, {tags: this._tags});
    return this.app.listen(opts, callback);
  }

  dialog(opts?: any) {
    opts = opts || {};

    return (req: any, res: any, next: any) => {

      log(`examining ${req.method}, dialog id: ${req.stackDialogId}`);
      if (req.stackDialogId && this._dialogs.has(req.stackDialogId)) {
        log('calling dialog handler');
        this._dialogs.get(req.stackDialogId)!.handle(req, res);
        return;
      }
      req.srf = res.srf = this;
      next();
    };
  }

  createUAS(req: Request, res: Response, opts: Srf.CreateUASOptions = {}, callback?: any): Promise<Dialog> | this {
    opts.headers = opts.headers || {};
    const body = opts.body || opts.localSdp;
    const generateSdp = typeof body === 'function' ? body : () => opts.localSdp;
    assert(typeof generateSdp === 'function');

    const __fail = (err: any, cb: any) => {
      log(`createUAS failed with ${err}`);
      cb(err);
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
          opts.dialogStateEmitter!.emit('stateChange', req._dialogState);
        }
      }
    }

    const __send = (content: string | undefined, cb: any) => {
      let called = false;
      log('createUAS sending');

      req.on('cancel', () => {
        req.canceled = called = true;
        if (req._dialogState) {
          Object.assign(req._dialogState, {state: DialogState.Cancelled});
          opts.dialogStateEmitter!.emit('stateChange', req._dialogState);
        }
        cb(new SipError(487, 'Request Terminated'));
      });

      return res.send(req.method === 'INVITE'  ? 200 : 202, {
        headers: opts.headers,
        body: content
      }, (err: any, response: any) => {
        if (err) {
          log(`createUAS: send failed with ${err}`);
          if (req._dialogState) {
            Object.assign(req._dialogState, {
              state: DialogState.Rejected
            });
            opts.dialogStateEmitter!.emit('stateChange', req._dialogState);
          }
          if (!called) {
            called = true;
            cb(err);
          }
          return;
        }

        if (req._dialogState) {
          const to = response.getParsedHeader('to');
          Object.assign(req._dialogState, {
            state: DialogState.Confirmed,
            localTag: to.params.tag
          });
          opts.dialogStateEmitter!.emit('stateChange', req._dialogState);
        }

        let dialog: Dialog;
        try {
          dialog = new Dialog(this, 'uas', {req: req, res: res, sent: response});
        } catch(err) {
          log(`createUAS: error creating dialog: ${err}`);
          if (!called) {
            called = true;
            cb(err);
          }
          return;
        }
        if (req._dialogState) {
          dialog.stateEmitter = {
            emitter: opts.dialogStateEmitter,
            state: req._dialogState
          };
        }

        this.addDialog(dialog);
        cb(null, dialog);

        if ('INVITE' === req.method) {
          dialog.once('ack', () => {
            // should we emit some sort of event?
          });
        }
      });
    };

    const __x = async(cb: any) => {
      try {
        if (!req.has('Contact')) {
          __fail(new Error('createUAS: Request is missing Contact header'), cb);
        }
        const sdp = await generateSdp() as string | undefined;
        log({sdp}, `createUAS - generateSdp returned ${sdp}`);
        __send(sdp, cb);
      } catch(err) {
        __fail(err, cb);
      }
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err: any, dialog: any) => {
        if (err) return reject(err);
        resolve(dialog);
      });
    });
  }

  createUAC(uri: string | Srf.CreateUACOptions, opts?: Srf.CreateUACOptions | any, cbRequest?: any, cbProvisional?: any, callback?: any): Promise<Dialog> | this {
    let redirectCount = 0;
    if (typeof uri === 'object') {
      callback = cbProvisional;
      cbProvisional = cbRequest;
      cbRequest = opts;
      opts = uri;
    }
    else {
      opts.uri = uri;
    }
    const usingTls = opts.uri.startsWith('sips');

    if (cbRequest && typeof cbRequest === 'object') {
      callback = cbProvisional;
      const obj = cbRequest;
      cbRequest = obj.cbRequest || noop;
      cbProvisional = obj.cbProvisional || noop;
    }
    else {
      cbProvisional = cbProvisional || noop;
      cbRequest = cbRequest || noop;
    }

    const __x = (cb: any) => {
      const method = opts.method || 'INVITE';
      opts.headers = opts.headers || {};

      assert.ok(method === 'INVITE' || method === 'SUBSCRIBE', 'method must be either INVITE or SUBSCRIBE');
      assert.ok(!!opts.uri, 'uri must be specified');

      const parsed = parser.parseUri(opts.uri);
      if (!parsed) {
        if (-1 === opts.uri.indexOf('@') && 0 !== opts.uri.indexOf('sip:')) {
          const address = opts.uri;
          opts.uri = 'sip:' + (opts.calledNumber ? opts.calledNumber + '@' : '') + address;
        }
        else if (0 !== opts.uri.indexOf('sip:')) {
          opts.uri = 'sip:' + opts.uri;
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
      const is3pcc = !opts.localSdp && 'INVITE' === method;

      const launchRequest = (launchUri: string, launchMethod: string, launchOpts: any, lCb: any) => {
        log({sdp: launchOpts.localSdp}, 'createUAC sending INVITE');
        this._app.request({
          uri: launchUri,
          method: launchMethod,
          proxy: launchOpts.proxy,
          headers: launchOpts.headers,
          body: launchOpts.localSdp,
          auth: launchOpts.auth,
          _socket: launchOpts._socket
        },
        (err: any, req: any) => {
          if (err) {
            cbRequest(err);
            return lCb(err);
          }
          if ('INVITE' === launchMethod &&
            launchOpts.dialogStateEmitter && launchOpts.dialogStateEmitter.listenerCount('stateChange') > 0) {

            const launchedFrom = req.getParsedHeader('from');
            const launchedTo = req.getParsedHeader('to');
            const u = Srf.parseUri(launchedTo.uri);
            if (u.user && u.host) {
              req._dialogState = {
                state: DialogState.Trying,
                direction: DialogDirection.Recipient,
                aor: `${u.user || 'unknown'}@${u.host || 'unknown'}`,
                callId: req.get('Call-ID'),
                localTag: launchedFrom.params.tag,
                id: idgen.new()
              };
            }
            launchOpts.dialogStateEmitter.emit('stateChange', req._dialogState);
          }
          cbRequest(null, req);

          req.on('update', (_updateReq: any, response: any) => {
            response.send(200, {body: launchOpts.localSdp});
          });

          req.on('response', (res: any, ack: any) => {
            if (res.status < 200) {
              if (req._dialogState && req._dialogState.state !== DialogState.Early) {
                const to = res.getParsedHeader('to');
                if (to.params.tag) {
                  Object.assign(req._dialogState, {remoteTag: to.params.tag, state: DialogState.Early});
                  launchOpts.dialogStateEmitter.emit('stateChange', req._dialogState);
                }
                else if (req._dialogState.state === DialogState.Trying) {
                  Object.assign(req._dialogState, {state: DialogState.Proceeding});
                  launchOpts.dialogStateEmitter.emit('stateChange', req._dialogState);
                }
              }
              cbProvisional(res);
              if (res.has('RSeq')) {
                ack(); // send PRACK
              }
            }
            else if (launchOpts.followRedirects &&
              res.status >= 300 && res.status <= 399 &&
              ++redirectCount < 5 && res.has('Contact')) {
              const contact = res.getParsedHeader('Contact');
              if (!contact || 0 === contact.length) {
                const error: any = new SipError(res.status, res.reason);
                error.res = res;
                return lCb(error);
              }

              let newUri;
              if (launchOpts.keepUriOnRedirect) {
                newUri = req.uri;
                launchOpts.proxy = contact[0].uri;
              }
              else {
                newUri = contact[0].uri;
              }
              setImmediate((launchRequest.bind(this, newUri, launchMethod, launchOpts, lCb)));
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
                launchOpts.dialogStateEmitter.emit('stateChange', req._dialogState);
              }
              if (is3pcc && 200 === res.status && !!res.body) {

                if (launchOpts.noAck === true) {

                  return lCb(null, {
                    sdp: res.body,
                    ack: (localSdp: string) => {
                      return new Promise((resolve, reject) => {
                        ack({body: localSdp});

                        if (!res.has('Contact')) {
                          log('createUAC: no Contact header in response, returning 480');
                          return reject(new Error('createUAC: no Contact header in response'));
                        }

                        let dialog: Dialog;
                        try {
                          dialog = new Dialog(this, 'uac', {req: req, res: res, auth: launchOpts.auth});
                        } catch(err) {
                          log(`createUAC: error creating dialog: ${err}`);
                          return reject(err);
                        }
                        dialog.local.sdp = localSdp;
                        this.addDialog(dialog);
                        resolve(dialog);
                      });
                    },
                    res
                  });
                }
                const p = sdpTransform.parse(res.body) as any;
                p.direction = 'recvonly';
                const bhSdp = sdpTransform.write(p);
                ack({
                  body: bhSdp
                });
              }
              else if (launchMethod === 'INVITE') {
                ack();
              }

              if ((200 === res.status && launchMethod === 'INVITE') ||
                  ((202 === res.status || 200 === res.status) && launchMethod === 'SUBSCRIBE')) {
                if (!res.has('Contact')) {
                  log('createUAC: no Contact header in response, returning 500');
                  const error: any = new SipError(500, 'No Contact header in response');
                  error.res = res;
                  return lCb(error);
                }
                let dialog: Dialog;
                try {
                  dialog = new Dialog(this, 'uac', {req: req, res: res, auth: launchOpts.auth});
                } catch(err) {
                  log(`createUAC: error creating dialog: ${err}`);
                  return lCb(err);
                }
                if (req._dialogState) {
                  dialog.stateEmitter = {
                    emitter: launchOpts.dialogStateEmitter,
                    state: req._dialogState
                  };
                }
                this.addDialog(dialog);
                return lCb(null, dialog);
              }
              const error: any = new SipError(res.status, res.reason);
              error.res = res;
              lCb(error);
            }
          });
        });
      };
      launchRequest(opts.uri, method, opts, cb);
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err: any, dialog: any) => {
        if (err) return reject(err);
        resolve(dialog);
      });
    });
  }

  createB2BUA(req: Request, res: Response, uri: string | Srf.CreateB2BUAOptions, opts?: Srf.CreateB2BUAOptions | any, cbRequest?: any, cbProvisional?: any, callback?: any): Promise<{ uac: Dialog; uas: Dialog }> | this {
    let cbFinalizedUac: any = noop;
    let countOfOutstandingPracks = 0;

    if (uri && typeof uri === 'object') {
      callback = cbProvisional;
      cbProvisional = cbRequest;
      cbRequest = opts;
      opts = uri;
    }
    else {

      opts = opts || {};
      if (typeof opts !== 'object') {
        callback = cbProvisional;
        cbProvisional = cbRequest;
        cbRequest = opts;
        opts = {};
      }
      opts.uri = uri;
    }

    if (cbRequest && typeof cbRequest === 'object') {
      callback = cbProvisional;
      const obj = cbRequest;
      cbRequest = obj.cbRequest || noop;
      cbProvisional = obj.cbProvisional || noop;
      cbFinalizedUac = obj.cbFinalizedUac || noop;
    }
    else {
      cbProvisional = cbProvisional || noop;
      cbRequest = cbRequest || noop;
    }

    assert.ok(typeof opts.uri === 'string');

    opts.method = req.method;

    const proxyRequestHeaders = opts.proxyRequestHeaders || [];
    const proxyResponseHeaders = opts.proxyResponseHeaders || [];
    const propagateFailure = !(opts.passFailure === false);
    const propagateProvisional = !(opts.passProvisionalResponses === false);

    opts.headers = opts.headers || {};
    opts.responseHeaders = opts.responseHeaders || {};

    if (proxyRequestHeaders[0] === 'all') {
      const reqHeaders = req.headers;
      possiblyRemoveHeaders(proxyRequestHeaders.slice(1), reqHeaders);
      copyAllHeaders(reqHeaders, opts.headers);
    } else {
      proxyRequestHeaders.forEach((hdr: string) => {
        const headerName = req.getHeaderName(hdr);
        if (headerName) {
          opts.headers[headerName] = req.get(hdr);
        }
      });
    }

    if (!(opts.headers.from || opts.headers.From) && !opts.callingNumber) { opts.callingNumber = req.callingNumber; }
    if (!(opts.headers.from || opts.headers.From) && !opts.callingName) { opts.callingName = req.callingName; }
    if (!(opts.headers.to || opts.headers.To) && !opts.calledNumber) { opts.calledNumber = req.calledNumber; }

    opts.localSdp = opts.localSdpB && typeof opts.localSdpB !== 'function' ? opts.localSdpB : req.body;
    const is3pcc = !opts.localSdp || opts.noAck;
    if (is3pcc) opts.noAck = true;

    let remoteSdpB: any, translatedRemoteSdpB: any;

    const generateSdpA = async(r: any) => {
      log('createB2BUA: generateSdpA');

      const sdpB = r.body;
      if (r.getParsedHeader('CSeq').method === 'SUBSCRIBE' || !sdpB) {
        return sdpB;
      }

      if (remoteSdpB && remoteSdpB === sdpB) {
        if (translatedRemoteSdpB) return translatedRemoteSdpB;

        await sleepFor(100);
        if (translatedRemoteSdpB) return translatedRemoteSdpB;
        await sleepFor(500);
        if (translatedRemoteSdpB) return translatedRemoteSdpB;
        await sleepFor(1000);
        return translatedRemoteSdpB;
      }

      remoteSdpB = sdpB;
      if (!opts.localSdpA) {
        return translatedRemoteSdpB = sdpB;
      }
      else if ('function' === typeof opts.localSdpA) {
        const sdpA = await opts.localSdpA(sdpB, r);
        return translatedRemoteSdpB = sdpA;
      }
      else {
        return translatedRemoteSdpB = opts.localSdpA;
      }
    };

    function handleUACSent(err: any, uacReq: any) {
      if (err) {
        log(`createB2BUA: Error sending uac request: ${err}`);
        res.send(500);
      }
      else {
        req.on('cancel', (cancelReq: any) => {
          log('createB2BUA: received CANCEL from A party, sending CANCEL to B');
          res.send(487);
          uacReq.cancel({
            headers: copyUASHeaderToUACForOnlyCancel(cancelReq)
          });
        });

        req.on('update', (_updateReq: any, r: any) => {
          if (translatedRemoteSdpB) {
            log('createB2BUA: received UPDATE from A party, responding with 200 OK and current answer');
            r.send(200, {
              body: translatedRemoteSdpB,
            });
          }
          else {
            log('createB2BUA: received UPDATE from A party before sending an answer, responding with 500');
            r.send(500);
          }
        });
      }
      cbRequest(err, uacReq);
    }

    function copyUASHeaderToUACForOnlyCancel(uasReq: any) {
      const headers: any = {};
      if (!uasReq) {
        return headers;
      }

      ['Reason', 'X-Reason']
        .forEach((hdr) => { if (uasReq.has(hdr)) headers[hdr] = uasReq.get(hdr);});

      return headers;
    }

    function copyUACHeadersToUAS(uacRes: any) {
      const headers: any = {};
      if (!uacRes) {
        return headers;
      }

      if (proxyResponseHeaders[0] === 'all') {
        const resHeaders = uacRes.headers;
        possiblyRemoveHeaders(proxyRequestHeaders.slice(1), resHeaders);
        copyAllHeaders(resHeaders, headers);
      }
      else {
        proxyResponseHeaders.forEach((hdr: string) => {
          log(`copyUACHeadersToUAS: hdr ${hdr}`);
          const headerName = uacRes.getHeaderName(hdr);
          if (headerName) {
            log(`copyUACHeadersToUAS: adding ${hdr}: uacRes.get(hdr)`);
            headers[headerName] = uacRes.get(hdr);
          }
        });
      }

      if (typeof opts.responseHeaders === 'function') {
        Object.assign(headers, opts.responseHeaders(uacRes, headers));
      }
      else if (typeof opts.responseHeaders === 'object') {
        Object.assign(headers, opts.responseHeaders);
      }
      log(`copyUACHeadersToUAS: ${JSON.stringify(headers)}`);
      return headers;
    }

    const handlePrack = (prack: any) => {
      const cseq = prack.get('CSeq');
      countOfOutstandingPracks--;
      log(`createB2BUA: received ${cseq} on UAS leg, countOfOutstandingPracks now: ${countOfOutstandingPracks}`);
    };

    const handleUACProvisionalResponse = async(provisionalRes: any, uacReq: any) => {
      if (provisionalRes.status > 101) {
        log(`Srf#createB2BUA: received a provisional response ${provisionalRes.status}`);
        if (propagateProvisional) {
          const resOpts: any = { headers: copyUACHeadersToUAS(provisionalRes) };

          let fnAck = null;
          if (resOpts.headers?.require?.includes('100rel')) {
            countOfOutstandingPracks++;
            fnAck = handlePrack;
            log(`createB2BUA: sending rel 18x, count of outstanding PRACKs: ${countOfOutstandingPracks}`);
          }
          if (provisionalRes.body) {
            try {
              const sdpA = await generateSdpA(provisionalRes);
              resOpts.body = sdpA;
              return res.send(provisionalRes.status, provisionalRes.reason, resOpts, null, fnAck);
            } catch(err: any) {
              log(`Srf#createB2BUA: failed in call to produceSdpForALeg: ${err.message}`);
              res.send(500);
              uacReq.cancel();
            }
          }
          else {
            res.send(provisionalRes.status, provisionalRes.reason, resOpts, null, fnAck);
          }
        }
        else {
          log('not propagating provisional response');
        }
      }
      cbProvisional(provisionalRes);
    };

    const __x = async(cb: any) => {
      log(`createB2BUA: creating UAC, opts: ${JSON.stringify(opts)}`);

      opts._socket = req.socket;

      if (opts.dialogStateEmitter && opts.dialogStateEmitter.listenerCount('stateChange') > 0) {
        const from = req.getParsedHeader('from');
        const u = Srf.parseUri(from.uri);
        if (u.user && u.host) {
          req._dialogState = {
            state: DialogState.Trying,
            direction: DialogDirection.Initiator,
            aor: `${u.user || 'unknown'}@${u.host || 'unknown'}`,
            callId: req.get('Call-ID'),
            remoteTag: from.params.tag,
            id: idgen.new()
          };
          opts.dialogStateEmitter!.emit('stateChange', req._dialogState);
        }
      }

      let uac: any;
      try {
        uac = await this.createUAC(opts, {cbRequest: handleUACSent, cbProvisional: handleUACProvisionalResponse});

      } catch(err: any) {
        log(`createB2BUA: received non-success ${err.status || err} on uac leg`);
        const errorOpts = {headers: copyUACHeadersToUAS(err.res)};
        if (propagateFailure && !res.finalResponseSent) {
          res.send(err.status || 500, err.reason, errorOpts);
        }
        return cb(err);
      }

      let finalResponse: any, ackFunction: any;
      if (is3pcc) {
        const {ack, res: r} = uac;
        finalResponse = r;
        ackFunction = ack;
      }
      else {
        finalResponse = uac.res;
        log('createB2BUA: successfully created UAC..queueing requests..');

        uac.queueRequests = true;
        cbFinalizedUac(uac);
      }

      let uas: any;
      try {

        if (countOfOutstandingPracks > 0) {
          log(`createB2BUA: waiting for ${countOfOutstandingPracks} outstanding PRACKs`);
          await sleepFor(100);
        }
        if (countOfOutstandingPracks > 0) {
          log(`createB2BUA: waiting for ${countOfOutstandingPracks} outstanding PRACKs`);
          await sleepFor(200);
        }
        if (countOfOutstandingPracks > 0) {
          log(`createB2BUA: waiting for ${countOfOutstandingPracks} outstanding PRACKs`);
          await sleepFor(200);
        }
        uas = await this.createUAS(req, res, {
          headers: copyUACHeadersToUAS(finalResponse),
          localSdp: generateSdpA.bind(null, finalResponse),
          dialogStateEmitter: opts.dialogStateEmitter
        });

        if (is3pcc) {
          log('createB2BUA: successfully created UAS..but this is 3pcc, so a bit more work to do');
          uas.once('ack', async(ackRequest: any) => {
            log(`createB2BUA: got ACK from UAS, pass on sdp: ${ackRequest.body}`);
            const sdp = await (typeof opts.localSdpB === 'function' ?
              opts.localSdpB(ackRequest.body) : Promise.resolve(ackRequest.body));
            uac = await ackFunction(sdp);
            uac.other = uas;
            uas.other = uac;
            log('createB2BUA: successfully created bot dialogs in 3pcc!');
            return cb(null, {uac, uas});
          });
          return;
        }

        log('createB2BUA: successfully created UAS..done!');
        uas.once('ack', () => {
          log('createB2BUA: got ACK from UAS, process any queued UAC requests');
          uac.queueRequests = false;
        });
        uac.other = uas;
        uas.other = uac;
        return cb(null, {uac, uas});
      } catch(err: any) {
        log({err}, 'createB2BUA: failed creating UAS..done!');
        uac && uac.destroy().catch(() => {});
        return cb(err);
      }
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err: any, dialogs: any) => {
        if (err) return reject(err);
        resolve(dialogs);
      });
    });
  }

  proxyRequest(req: Request, destination: string | string[] | Srf.ProxyRequestOptions, opts?: Srf.ProxyRequestOptions, callback?: any): Promise<any> | this {
    assert(typeof destination === 'undefined' || typeof destination === 'string' || Array.isArray(destination),
      '\'destination\' is must be a string or an array of strings');

    if (typeof destination === 'function') {
      callback = destination;
    }
    else if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = opts || {};
    opts.destination = destination;

    const __x = (cb: any) => {
      req.proxy(opts, cb);
    };

    log(`Srf#proxyRequest opts ${JSON.stringify(opts)}, callback ${typeof callback}`);
    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err: any, results: any) => {
        if (err) return reject(err);
        resolve(results);
      });
    });
  }

  request(socket: any, uri?: any, opts?: any, callback?: any): Promise<Request> | this {
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

    const __x = (cb: any) => {
      return socket ?
        this._app.request(socket, uri, opts, cb) :
        this._app.request(uri, opts, cb);
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err: any, req: any) => {
        if (err) return reject(err);
        resolve(req);
      });
    });
  }

  findDialogById(stackDialogId: string): Dialog | undefined {
    return this._dialogs.get(stackDialogId);
  }

  findDialogByCallIDAndFromTag(callId: string, tag: string): Dialog | undefined {
    const stackDialogId = `${callId};from-tag=${tag}`;
    return this._dialogs.get(stackDialogId);
  }

  addDialog(dialog: Dialog): void {
    this._dialogs.set(dialog.id, dialog);
    log('Srf#addDialog: adding dialog with id %s type %s, dialog count is now %d ',
      dialog.id, dialog.dialogType, this._dialogs.size);
  }

  removeDialog(dialog: Dialog): void {
    this._dialogs.delete(dialog.id);
    log('Srf#removeDialog: removing dialog with id %s dialog count is now %d', dialog.id, this._dialogs.size);
  }

  unregisterForMessages(sipVerb: string): void {
    this._app.client.removeRoute(sipVerb);
  }

  reregisterForMessages(sipVerb: string): void {
    this._app.client.route(sipVerb);
  }

  _b2bRequestWithinDialog(dlg: Dialog, req: any, res: any, proxyRequestHeaders: string[], proxyResponseHeaders: string[], callback?: any): void {
    callback = callback || noop;
    let headers: any = {};
    proxyRequestHeaders.forEach((hdr) => {
      const headerName = req.getHeaderName(hdr);
      if (headerName) {
        headers[headerName] = req.get(hdr);
      }
    });
    dlg.request({
      method: req.method,
      headers: headers,
      body: req.body
    }, (err: any, response: any) => {
      headers = {};
      proxyResponseHeaders.forEach((hdr) => {
        if (!!response && response.has(hdr)) {
          const headerName = response.getHeaderName(hdr);
          if (headerName) {
            headers[headerName] = response.get(hdr);
          }
        }
      });

      if (err) {
        log('b2bRequestWithinDialog: error forwarding request: %s', err);
        res.send(response.status || 503, response.reason, { headers: headers});
        return callback(err);
      }
      let status = response.status;

      if (req.method === 'NOTIFY' && req.has('Subscription-State') &&
        /terminated/.test(req.get('Subscription-State')) && status === 503) {
        log('b2bRequestWithinDialog: failed forwarding a NOTIFY with ' +
          'subscription-terminated due to client disconnect');
        status = 200;
      }
      res.send(status, response.reason, { headers: headers});
      callback(null);
    });
  }

  static get Dialog() {
    return Dialog;
  }

  static get SipError() {
    return SipError;
  }

  static get parseUri() {
    return parser.parseUri;
  }

  static get stringifyUri() {
    return parser.stringifyUri;
  }

  static get SipMessage() {
    return SipMessage;
  }

  static get SipRequest() {
    return Request;
  }
  static get SipResponse() {
    return Response;
  }

  static get DialogState() {
    return DialogState;
  }
  static get DialogDirection() {
    return DialogDirection;
  }
}

delegate(Srf.prototype, '_app')
  .method('endSession')
  .method('disconnect')
  .method('set')
  .method('get')
  .method('use')
  .access('locals')
  .getter('idle');

methods.forEach((method: string) => {
  delegate(Srf.prototype, '_app').method(method.toLowerCase());
});

export = Srf;
