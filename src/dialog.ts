import { EventEmitter as Emitter } from 'events';
import assert from 'assert';
import only from 'only';
import methods from 'sip-methods';
import debug from 'debug';
import SipError from './sip_error';
import { parseUri } from './sip-parser/parser';
import sdpTransform from 'sdp-transform';

const log = debug('drachtio:srf');

interface DialogState {
  emitter?: Emitter;
  state?: any;
}

import Request from './request';
import Response from './response';
import SipMessage from './sip-parser/message';

declare namespace Dialog {
  export interface DialogEvents {
    /** Emitted when the dialog is destroyed (e.g., BYE received/sent). */
    'destroy': (msg: SipMessage | Request, reason?: string) => void;
    /** Emitted when the dialog is modified (e.g., re-INVITE with new SDP). */
    'modify': (req: Request, res: Response) => void;
    /** Emitted when the dialog is refreshed (e.g., re-INVITE with same SDP). */
    'refresh': (req: Request) => void;
    /** Emitted when an INFO request is received within the dialog. */
    'info': (req: Request, res: Response) => void;
    /** Emitted when a NOTIFY request is received within the dialog. */
    'notify': (req: Request, res: Response) => void;
    /** Emitted when an OPTIONS request is received within the dialog. */
    'options': (req: Request, res: Response) => void;
    /** Emitted when an UPDATE request is received within the dialog. */
    'update': (req: Request, res: Response) => void;
    /** Emitted when a REFER request is received within the dialog. */
    'refer': (req: Request, res: Response) => void;
    /** Emitted when a MESSAGE request is received within the dialog. */
    'message': (req: Request, res: Response) => void;
    /** Emitted when an ACK is received for a request sent within the dialog. */
    'ack': (req: Request) => void;
    /** Emitted when a SUBSCRIBE request is received within the dialog. */
    'subscribe': (req: Request, res: Response) => void;
    /** Emitted when an un-SUBSCRIBE (Expires: 0) is received. */
    'unsubscribe': (req: Request, event: string) => void;
    /** Emitted when a hold request (e.g., SDP a=sendonly or c=0.0.0.0) is received. */
    'hold': (req: Request) => void;
    /** Emitted when an unhold request is received. */
    'unhold': (req: Request) => void;
  }

  /**
   * Options for sending an in-dialog request.
   */
  export interface DialogRequestOptions {
    /** The SIP method to send (e.g., 'INFO', 'UPDATE'). */
    method?: string;
    /** SIP Headers to include in the request. */
    headers?: Record<string, string>;
    /** The body of the request (e.g., SDP, plain text, JSON). */
    body?: string;
    /** Authentication credentials. */
    auth?: { username: string; password: string; } | ((req: Request, res: Response, callback: any) => void);
    /** If true, suppress automatically sending an ACK. */
    noAck?: boolean;
  }

  export type DialogRequestCallback = (err: Error | null, res?: Response | any, ack?: any) => void;
}

/**
 * Represents a SIP Dialog.
 * Dialogs are created via Srf.createUAS, Srf.createUAC, or Srf.createB2BUA.
 * They emit events for in-dialog requests and allow sending requests within the dialog.
 * 
 * @example
 * ```typescript
 * dialog.on('destroy', () => console.log('Dialog ended'));
 * dialog.on('info', (req, res) => {
 *   res.send(200);
 * });
 * 
 * await dialog.request({ method: 'INFO', body: '...' });
 * ```
 */
declare interface Dialog {
  on<U extends keyof Dialog.DialogEvents>(event: U, listener: Dialog.DialogEvents[U]): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once<U extends keyof Dialog.DialogEvents>(event: U, listener: Dialog.DialogEvents[U]): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  off<U extends keyof Dialog.DialogEvents>(event: U, listener: Dialog.DialogEvents[U]): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  emit<U extends keyof Dialog.DialogEvents>(event: U, ...args: Parameters<Dialog.DialogEvents[U]>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;

  /** Send an in-dialog INVITE request */
  invite(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  invite(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog REGISTER request */
  register(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  register(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog BYE request (terminates the dialog) */
  bye(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  bye(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog CANCEL request */
  cancel(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  cancel(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog ACK request */
  ack(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  ack(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog INFO request */
  info(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  info(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog NOTIFY request */
  notify(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  notify(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog OPTIONS request */
  options(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  options(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog PRACK request */
  prack(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  prack(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog PUBLISH request */
  publish(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  publish(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog REFER request */
  refer(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  refer(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog SUBSCRIBE request */
  subscribe(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  subscribe(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog UPDATE request */
  update(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  update(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
  
  /** Send an in-dialog MESSAGE request */
  message(opts?: Dialog.DialogRequestOptions): Promise<Response>;
  message(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
}

class Dialog extends Emitter {
  srf: any;
  type: string;
  req: Request;
  res: Response;
  auth: any;
  agent: any;
  onHold: boolean;
  connected: boolean;
  queuedRequests: { req: Request, res: Response }[];
  _queueRequests: boolean;
  _reinvitesInProgress: { count: number; admitOne: (() => void)[] };
  sip: { callId: string; remoteTag: string; localTag: string };
  local: { uri: string; sdp: string; contact: string };
  remote: { uri: string; sdp: string };
  subscriptions: string[];
  _emitter?: Emitter;
  _state?: any;
  other?: Dialog; // Add if used by srf

  constructor(srf: any, type: string, opts: { req: Request; res: Response; auth?: any; sent?: any }) {
    super();

    const types = ['uas', 'uac'];
    assert.ok(-1 !== types.indexOf(type), 'argument \'type\' must be one of ' + types.join(','));

    this.srf = srf;
    this.type = type;
    this.req = opts.req;
    this.res = opts.res;
    this.auth = opts.auth;
    this.agent = this.res.agent;
    this.onHold = false;
    this.connected = true;
    this.queuedRequests = [];
    this._queueRequests = false;

    this._reinvitesInProgress = {
      count: 0,
      admitOne: []
    };

    this.sip = {
      callId: this.res.get('Call-ID') || '',
      remoteTag: ('uas' === type ?
        this.req.getParsedHeader('from').params.tag : this.res.getParsedHeader('to').params.tag) as string,
      localTag: ('uas' === type ?
        opts.sent.getParsedHeader('to').params.tag : this.req.getParsedHeader('from').params.tag) as string
    };

    this.local = {
      uri: 'uas' === type ? opts.sent.getParsedHeader('Contact')[0].uri : this.req.uri,
      sdp: 'uas' === type ? opts.sent.body : this.req.body,
      contact: 'uas' === type ? opts.sent.get('Contact') : this.req.get('Contact') || ''
    };

    this.remote = {
      uri: 'uas' === type ? this.req.getParsedHeader('Contact')[0].uri : this.res.getParsedHeader('Contact')[0].uri,
      sdp: 'uas' === type ? this.req.body : this.res.body
    };

    this.subscriptions = [];

    if (this.req.method === 'SUBSCRIBE') {
      this.addSubscription(this.req);
    }
  }

  get id(): string {
    return this.res.stackDialogId || '';
  }

  get dialogType(): string {
    return this.req.method;
  }

  get subscribeEvent(): string | null | undefined {
    return this.dialogType === 'SUBSCRIBE' ? this.req.get('Event') : null;
  }

  get socket(): any {
    return this.req.socket;
  }

  set stateEmitter(val: DialogState) {
    this._emitter = val.emitter;
    this._state = val.state;
  }

  set queueRequests(enqueue: boolean) {
    log(`dialog ${this.id}: queueing requests: ${enqueue ? 'ON' : 'OFF'}`);
    this._queueRequests = enqueue;
    if (!enqueue) {
      if (this.queuedRequests.length > 0) {
        setImmediate(() => {
          log(`dialog ${this.id}: processing ${this.queuedRequests.length} queued requests`);
          this.queuedRequests.forEach(({req, res}) => this.handle(req, res));
          this.queuedRequests = [];
        });
      }
    }
  }

  toJSON() {
    return only(this, 'id type sip local remote onHold');
  }

  toString() {
    return this.toJSON().toString();
  }

  getCountOfSubscriptions(): number {
    return this.subscriptions.length;
  }

  addSubscription(req: any): number {
    const to = req.getParsedHeader('To');
    const u = parseUri(to.uri);
    log(`Dialog#addSubscription: to header: ${JSON.stringify(to)}, uri ${JSON.stringify(u)}`);
    const entity = `${u.user}@${u.host}:${req.get('Event')}`;
    this.subscriptions.push(entity);
    log(`Dialog#addSubscription: adding subscription ${entity}; current count ${this.subscriptions.length}`);
    return this.subscriptions.length;
  }

  removeSubscription(uri: string, event: string): number {
    const u = parseUri(uri);
    const entity = `${u.user}@${u.host}:${event}`;
    const idx = this.subscriptions.indexOf(entity);
    if (-1 === idx) {
      console.error(`Dialog#removeSubscription: no subscription found for ${entity}: subs: ${this.subscriptions}`);
    }
    else {
      this.subscriptions.splice(idx, 1);
    }
    return this.subscriptions.length;
  }

  /**
   * Destroys the dialog by sending a BYE (if an INVITE dialog) or a terminating NOTIFY (if a SUBSCRIBE dialog).
   * 
   * @param opts Options including custom headers to send with the terminating request.
   * @returns A promise resolving to the sent SipMessage or Request.
   */
  destroy(opts?: { headers?: Record<string, string>; auth?: Dialog.DialogRequestOptions['auth']; }): Promise<SipMessage | Request>;
  destroy(opts: { headers?: Record<string, string>; auth?: Dialog.DialogRequestOptions['auth']; } | undefined, callback: (err: Error | null, msg?: SipMessage | Request) => void): this;
  destroy(opts?: { headers?: Record<string, string>; auth?: Dialog.DialogRequestOptions['auth']; } | ((err: Error | null, msg?: SipMessage | Request) => void), callback?: (err: Error | null, msg?: SipMessage | Request) => void): Promise<SipMessage | Request> | this {
    opts = opts || {};
    if (typeof opts === 'function') {
      callback = opts as any;
      opts = {};
    }
    this.queuedRequests = [];

    const removeDialog = (err: any, res: any, cb: any) => {
      this.connected = false;
      this.srf.removeDialog(this);
      if (cb) cb(err, res);
      this.removeAllListeners();
    };

    const __x = (cb: any) => {
      if (this.dialogType === 'INVITE') {
        try {
          this.agent.request({
            method: 'BYE',
            headers: opts.headers || {},
            stackDialogId: this.id,
            auth: opts.auth || this.auth,
            _socket: this.socket
          }, (err: any, bye: any) => {
            if (err || !bye) {
              return removeDialog(err, bye, cb);
            }
            bye.on('response', () => {
              removeDialog(err, bye, cb);
            });
          });
        } catch(err) {
          removeDialog(err, null, cb);
        }
        if (this._emitter) {
          Object.assign(this._state, {state: 'terminated'});
          this._emitter.emit('stateChange', this._state);
          this._emitter = undefined;
        }
      }
      else if (this.dialogType === 'SUBSCRIBE') {
        opts.headers = opts.headers || {};
        opts.headers['subscription-state'] = 'terminated';
        opts.headers['event'] = this.subscribeEvent || '';
        try {
          this.agent.request({
            method: 'NOTIFY',
            headers: opts.headers || {},
            stackDialogId: this.id,
            _socket: this.socket
          }, (err: any, notify: any) => {
            removeDialog(err, notify, cb);
          });
        } catch(err) {
          removeDialog(err, null, cb);
        }
      }
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err: any, msg: any) => {
        if (err) return reject(err);
        resolve(msg);
      });
    });
  }

  /**
   * Modifies the dialog by sending a re-INVITE.
   * 
   * @param sdp Optional new SDP to send.
   * @param opts Additional options for the request.
   * @returns A promise resolving to the new SDP (or an object with SDP and ACK function if noAck was true).
   */
  modify(sdp?: string | { headers?: Record<string, string>; auth?: Dialog.DialogRequestOptions['auth']; noAck?: boolean; }): Promise<string | { sdp: string, ack: (opts?: any) => void }>;
  modify(sdp: string | { headers?: Record<string, string>; auth?: Dialog.DialogRequestOptions['auth']; noAck?: boolean; } | undefined, callback: (err: Error | null, sdp?: string, ack?: (opts?: any) => void) => void): this;
  modify(sdp: string, opts: { headers?: Record<string, string>; auth?: Dialog.DialogRequestOptions['auth']; noAck?: boolean; }): Promise<string | { sdp: string, ack: (opts?: any) => void }>;
  modify(sdp: string, opts: { headers?: Record<string, string>; auth?: Dialog.DialogRequestOptions['auth']; noAck?: boolean; } | undefined, callback: (err: Error | null, sdp?: string, ack?: (opts?: any) => void) => void): this;
  modify(sdp?: string | { headers?: Record<string, string>; auth?: Dialog.DialogRequestOptions['auth']; noAck?: boolean; } | ((err: Error | null, sdp?: string, ack?: (opts?: any) => void) => void), opts?: { headers?: Record<string, string>; auth?: Dialog.DialogRequestOptions['auth']; noAck?: boolean; } | ((err: Error | null, sdp?: string, ack?: (opts?: any) => void) => void), callback?: (err: Error | null, sdp?: string, ack?: (opts?: any) => void) => void): Promise<string | { sdp: string, ack: (opts?: any) => void }> | this {
    if (typeof sdp === 'object') {
      callback = opts as any;
      opts = sdp;
      sdp = undefined;
    }
    opts = opts || {};
    if (typeof opts === 'function') {
      callback = opts as any;
      opts = {};
    }
    log(`opts: ${JSON.stringify(opts)}`);


    function onReInviteComplete(dlg: Dialog) {
      dlg._reinvitesInProgress.count--;
      const admitOne = dlg._reinvitesInProgress.admitOne.shift();
      if (admitOne) setImmediate(admitOne);
    }

    const __x = async(cb: any) => {

      if (!this.connected) return cb(new Error('invalid request to modify a completed dialog'));

      if (this._reinvitesInProgress.count++ > 0) {
        await new Promise((resolve) => this._reinvitesInProgress.admitOne.push(resolve as () => void));

        if (!this.connected) {
          this._reinvitesInProgress.count--;
          this._reinvitesInProgress.admitOne.forEach((fn: any) => setImmediate(fn));
          return cb(new Error('dialog was destroyed before we could modify it'));
        }
      }

      switch (sdp) {
        case 'hold':
          this.local.sdp = this.local.sdp.replace(/a=sendrecv/, 'a=inactive');
          this.onHold = true;
          break;
        case 'unhold':
          if (this.onHold) {
            this.local.sdp = this.local.sdp.replace(/a=inactive/, 'a=sendrecv');
          }
          else {
            console.error('Dialog#modify: attempt to \'unhold\' session which is not on hold');
            this._reinvitesInProgress.count--;
            return process.nextTick(() => {
              cb(new Error('attempt to unhold session that is not on hold'));
            });
          }
          break;
        default:
          if (typeof sdp === 'string') this.local.sdp = sdp;
          break;
      }

      log(`Dialog#modify: sending reINVITE for dialog id: ${this.id}, sdp: ${this.local.sdp}`);
      if (opts.headers && !opts.headers['Contact']) {
        opts.headers['Contact'] = this.local.contact;
      }
      try {
        this.agent.request({
          method: 'INVITE',
          stackDialogId: this.id,
          body: this.local.sdp,
          _socket: this.socket,
          auth: opts.auth || this.auth,
          headers:
            opts.headers ? opts.headers : {'Contact': this.local.contact}
        }, (err: any, req: any) => {
          if (err) {
            this._reinvitesInProgress.count--;
            const admitOne = this._reinvitesInProgress.admitOne.shift();
            if (admitOne) setImmediate(admitOne);
            return cb(err);
          }
          req.on('response', (response: any, ack: any) => {
            log(`Dialog#modifySession: received response to reINVITE with status ${response.status}`);
            if (response.status >= 200) {
              if (200 === response.status) {
                this.remote.sdp = response.body;
                if (this.local.sdp || opts.noAck !== true) {
                  ack();
                  onReInviteComplete(this);
                  return cb(null, response.body);
                }
                else {
                  log(`opts: ${JSON.stringify(opts)}`);
                  log('SipDialog#modify: go 200 OK to 3pcc INVITE with no sdp; ack is application responsibility');
                  return cb(null, response.body, (ackSdp: string) => {
                    ack({body: ackSdp});
                    onReInviteComplete(this);
                  });
                }
              }
              cb(new SipError(response.status, response.reason));
            }
          });
        });
      } catch(err) {
        cb(err);
      }
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err: any, outSdp: any, ack: any) => {
        if (err) return reject(err);
        if (ack) resolve({sdp: outSdp, ack});
        else resolve(outSdp);
      });
    });
  }

  /**
   * Sends an arbitrary SIP request within the context of the dialog.
   * 
   * @param opts Options specifying the method, body, and headers.
   * @returns A promise resolving to the SIP Response.
   * 
   * @example
   * ```typescript
   * try {
   *   const response = await dialog.request({
   *     method: 'INFO',
   *     headers: { 'Content-Type': 'application/dtmf-relay' },
   *     body: 'Signal=1\r\nDuration=100'
   *   });
   *   console.log('INFO accepted:', response.status);
   * } catch (err) {
   *   console.error('Failed to send INFO', err);
   * }
   * ```
   */
  request(opts: Dialog.DialogRequestOptions): Promise<Response>;
  request(opts: Dialog.DialogRequestOptions, callback: Dialog.DialogRequestCallback): this;
  request(opts: Dialog.DialogRequestOptions, callback?: Dialog.DialogRequestCallback): Promise<Response> | this {
    assert.ok(typeof opts.method === 'string' &&
      -1 !== methods.indexOf(opts.method), '\'opts.method\' is required and must be a SIP method');

    const __x = (cb: any) => {
      const method = opts.method!.toUpperCase();

      try {
        this.agent.request({
          method: method,
          stackDialogId: this.id,
          headers: opts.headers || {},
          auth: opts.auth || this.auth,
          _socket: this.socket,
          body: opts.body
        }, (err: any, req: any) => {
          if (err) {
            return cb(err);
          }

          req.on('response', (response: any, ack: any) => {
            if ('BYE' === method) {
              this.srf.removeDialog(this);
            }
            if ('INVITE' === method && response.status >= 200) {
              if (response.status > 200 || opts.body || opts.noAck !== true) ack();
              else {
                return cb(null, response, ack);
              }
            }

            if (this.dialogType === 'SUBSCRIBE' && 'NOTIFY' === method &&
              /terminated/.test(req.get('Subscription-State'))) {
              log('received response to a NOTIFY we sent terminating final subscription; dialog is ended');

              const from = req.getParsedHeader('From');
              if (this.removeSubscription(from.uri, req.get('Event')) === 0) {
                this.connected = false;
                this.srf.removeDialog(this);
                this.emit('destroy', req);
                this.removeAllListeners();
              }
            }
            cb(null, response);
          });
        });
      } catch(err) {
        cb(err);
      }
    };

    if (callback) {
      __x(callback);
      return this;
    }

    return new Promise((resolve, reject) => {
      __x((err: any, response: any) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  handle(req: any, res: any) {
    log(`dialog ${this.id}: handle: ${req.method}`);
    if (this._queueRequests === true) {
      log(`dialog ${this.id}: queueing incoming request: ${req.method}`);
      this.queuedRequests.push({req, res});
      return;
    }
    const eventName = req.method.toLowerCase();
    switch (req.method) {
      case 'BYE': {
        if (this._emitter) {
          Object.assign(this._state, {state: 'terminated'});
          this._emitter.emit('stateChange', this._state);
          this._emitter = undefined;
        }

        let reason = 'normal release';
        if (req.meta.source === 'application') {
          if (req.has('Reason')) {
            reason = req.get('Reason');
            const arr = /text="(.*)"/.exec(reason);
            if (arr) reason = arr[1];
          }
        }
        this.connected = false;
        this.srf.removeDialog(this);
        res.send(200);
        this.emit('destroy', req, reason);
        this.removeAllListeners();
        break;
      }

      case 'INVITE': {
        const origRedacted = this.remote.sdp.replace(/^o=.*$/m, 'o=REDACTED');
        const newRedacted = req.body.replace(/^o=.*$/m, 'o=REDACTED');
        let refresh = false;
        try {
          if (this.listeners('refresh').length > 0) {
            const sdp1 = sdpTransform.parse(this.remote.sdp) as any;
            const sdp2 = sdpTransform.parse(req.body) as any;
            refresh = sdp1.origin.sessionId === sdp2.origin.sessionId &&
              sdp1.origin.sessionVersion === sdp2.origin.sessionVersion;
          }
        } catch { /* empty */ }
        const hold = origRedacted.replace(/a=sendrecv\r\n/g, 'a=sendonly\r\n') === newRedacted &&
          this.listeners('hold').length > 0;
        const unhold = this.onHold === true &&
          origRedacted.replace(/a=sendonly\r\n/g, 'a=sendrecv\r\n') === newRedacted &&
          this.listeners('unhold').length > 0;
        const modify = !hold && !unhold && !refresh;
        this.remote.sdp = req.body;

        if (refresh) {
          this.emit('refresh', req);
        }
        else if (hold) {
          this.local.sdp = this.local.sdp.replace(/a=sendrecv\r\n/g, 'a=recvonly\r\n');
          this.onHold = true;
          this.emit('hold', req);
        }
        else if (unhold) {
          this.onHold = false;
          this.local.sdp = this.local.sdp.replace(/a=recvonly\r\n/g, 'a=sendrecv\r\n');
          this.emit('unhold', req);
        }
        if ((refresh || hold || unhold) || (modify && 0 === this.listeners('modify').length)) {
          log('responding with 200 OK to reINVITE');
          res.send(200, {
            body: this.local.sdp,
            headers: {
              'Contact': this.local.contact,
              'Content-Type': 'application/sdp'
            }
          });
        }
        else if (modify) {
          this.emit('modify', req, res);
        }
        break;
      }

      case 'NOTIFY':
        if (this.dialogType === 'SUBSCRIBE' &&
          req.has('subscription-state') &&
          /terminated/.test(req.get('subscription-state'))) {

          setImmediate(() => {
            const to = req.getParsedHeader('to');
            if (this.removeSubscription(to.uri, req.get('Event')) === 0) {
              log('received a NOTIFY with Subscription-State terminated for final subscription; dialog is ended');
              this.connected = false;
              this.srf.removeDialog(this);
              this.emit('destroy', req);
            }
          });
        }
        if (0 === this.listeners(eventName).length) {
          res.send(200);
        }
        else {
          this.emit(eventName, req, res);
        }
        break;

      case 'INFO':
      case 'REFER':
      case 'OPTIONS':
      case 'MESSAGE':
      case 'PUBLISH':

        setImmediate(() => {
          if (0 === this.listeners(eventName).length) res.send(200);
          else this.emit(eventName, req, res);
        });
        break;

      case 'UPDATE':
        setImmediate(() => {
          if (0 === this.listeners(eventName).length) res.send(200, {
            ...(req.body && this.local.sdp && {body: this.local.sdp})
          });
          else this.emit(eventName, req, res);
        });
        break;


      case 'SUBSCRIBE':
        if (req.has('Expires') && 0 === parseInt(req.get('Expires') as string)) {
          res.send(202);
          this.emit('unsubscribe', req, 'unsubscribe');
        }
        else {
          if (0 === this.listeners('subscribe').length) {
            res.send(489, 'Bad Event - no dialog handler');
          }
          else this.emit('subscribe', req, res);
        }
        break;

      case 'ACK':
        setImmediate(() => this.emit('ack', req));
        break;

      default:
        console.error(`Dialog#handle received invalid method within an INVITE dialog: ${req.method}`);
        res.send(501);
        break;
    }

  }
}

methods.forEach((method: string) => {
  (Dialog.prototype as any)[method.toLowerCase()] = function(this: Dialog, opts: any, cb: any) {
    opts = opts || {};
    opts.method = method;
    return this.request(opts, cb);
  };
});

export = Dialog;
