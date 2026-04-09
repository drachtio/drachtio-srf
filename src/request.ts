import { EventEmitter as Emitter } from 'events';
import delegate from 'delegates';
import assert from 'assert';
const noop = () => {};
import debug from 'debug';
import SipMessage from './sip-parser/message';
import Response from './response';
import DrachtioAgent from './drachtio-agent';

const log = debug('drachtio:request');

declare namespace Request {
  export interface RequestEvents {
    'response': (res: Response, ack: (opts?: any) => void) => void;
    'cancel': (cancelReq: SipMessage) => void;
    'update': (req: Request, res: Response) => void;
    'authenticate': (req: Request) => void;
  }
}

/**
 * Represents an incoming or outgoing SIP Request.
 * Contains properties for inspecting the request (e.g., method, uri, headers, body)
 * and methods for operating on it (e.g., proxying, canceling).
 * 
 * @example
 * ```typescript
 * srf.invite((req, res) => {
 *   console.log(`Received ${req.method} from ${req.callingNumber}`);
 *   const to = req.getParsedHeader('To');
 *   console.log('To URI:', to.uri);
 * });
 * ```
 */
declare interface Request {
  on<U extends keyof Request.RequestEvents>(event: U, listener: Request.RequestEvents[U]): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once<U extends keyof Request.RequestEvents>(event: U, listener: Request.RequestEvents[U]): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  off<U extends keyof Request.RequestEvents>(event: U, listener: Request.RequestEvents[U]): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  emit<U extends keyof Request.RequestEvents>(event: U, ...args: Parameters<Request.RequestEvents[U]>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;

  /** Get the string value of a SIP header. Returns undefined if not present. */
  get(hdr: string): string | undefined;
  /** Check if the request has a specific SIP header. */
  has(hdr: string): boolean;
  /** Get the properly cased name of a header as it appears in the message. */
  getHeaderName(hdr: string): string | undefined;
  /** Parse and return a Contact header as an array of AOR objects. */
  getParsedHeader(name: 'contact' | 'Contact'): Array<SipMessage.AOR>;
  /** Parse and return a Via header as an array of Via objects. */
  getParsedHeader(name: 'via' | 'Via'): Array<SipMessage.Via>;
  /** Parse and return an address-of-record header (like To, From). */
  getParsedHeader(name: 'To' | 'to' | 'From' | 'from' | 'refer-to' | 'referred-by' | 'p-asserted-identity' | 'remote-party-id'): SipMessage.AOR;
  /** Parse and return an arbitrary SIP header. */
  getParsedHeader(name: string): any;
  /** Parse and return an arbitrary SIP header. */
  getParsedHeader(hdr: string): any;
  /** Set or modify a SIP header. */
  set(hdr: string | Record<string, string>, value?: string): this;

  /** The SIP method (e.g., 'INVITE', 'OPTIONS'). */
  method: string;
  /** The SIP Request-URI. */
  uri: string;
  /** The collection of SIP headers. */
  headers: Record<string, string>;
  /** The body of the request (e.g., SDP). */
  body: string;
  /** For multipart messages, an array of body payloads. */
  payload: SipMessage.Payload[];

  /** The message type ('request' or 'response'). */
  readonly type: string;
  /** The raw, unparsed SIP message string. */
  readonly raw: string;
  /** The calling number (user part of the From header URI). */
  readonly callingNumber: string;
  /** The calling name (display name of the From header). */
  readonly callingName: string;
  /** The called number (user part of the To header URI). */
  readonly calledNumber: string;
  /** True if the method can create a dialog (e.g., INVITE, SUBSCRIBE). */
  readonly canFormDialog: boolean;
}

class Request extends Emitter {
  msg: SipMessage;
  _res?: Response;
  _agent?: DrachtioAgent;
  source?: string;
  source_address?: string;
  source_port?: number;
  protocol?: string;
  stackTime?: string;
  stackTxnId?: string;
  stackDialogId?: string;
  server?: any;
  receivedOn?: string;
  sessionToken?: string;
  socket?: any;
  auth?: any;
  _originalParams?: any;
  canceled?: boolean;
  [key: string]: any; // for delegates and passport

  constructor(msg?: SipMessage, meta?: any) {
    super();

    if (msg) {
      assert(msg instanceof SipMessage);
      this.msg = msg;
      if (meta) {
        this.meta = meta;
      }
    } else {
      this.msg = new SipMessage();
    }
  }

  get res(): Response | undefined {
    return this._res;
  }
  set res(res: Response | undefined) {
    this._res = res;
  }

  get isNewInvite(): boolean {
    const to = this.getParsedHeader('to');
    return this.method === 'INVITE' && !('tag' in to.params);
  }

  get url(): string | undefined {
    return this.uri;
  }

  set agent(agent: DrachtioAgent | undefined) {
    this._agent = agent;
  }
  get agent(): DrachtioAgent | undefined {
    return this._agent;
  }

  set meta(meta: any) {
    log(`Request#set meta ${JSON.stringify(meta)}`);
    this.source = meta.source;
    this.source_address = meta.address;
    this.source_port = meta.port ? parseInt(meta.port) : 5060;
    this.protocol = meta.protocol;
    this.stackTime = meta.time;
    this.stackTxnId = meta.transactionId;
    this.stackDialogId = meta.dialogId;
    if (meta.server) this.server = meta.server;
    if (meta.receivedOn) this.receivedOn = meta.receivedOn;
    if (meta.sessionToken) this.sessionToken = meta.sessionToken;
  }

  get meta(): any {
    return {
      source: this.source,
      source_address: this.source_address,
      source_port: this.source_port,
      protocol: this.protocol,
      time: this.stackTime,
      transactionId: this.stackTxnId,
      dialogId: this.stackDialogId
    };
  }

  /**
   * Cancels an outbound request (must be a UAC request).
   * 
   * @param opts Additional options to pass to the CANCEL request.
   * @param callback Optional callback.
   */
  cancel(opts?: any, callback?: any): void {
    opts = opts || {};
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    if (!this._agent || this.source !== 'application') {
      throw new Error('Request#cancel can only be used for uac Request');
    }
    this._agent.request(this.socket, Object.assign(
      {
        uri: this.uri,
        method: 'CANCEL',
        stackTxnId: this.stackTxnId
      }, opts),
    callback);
  }

  /**
   * Proxies an incoming request to a specific destination or multiple destinations.
   * 
   * @param opts Proxy options including destination, forking strategy, and timeouts.
   * @returns A promise resolving to the final result of the proxy operation.
   * 
   * @example
   * ```typescript
   * srf.invite(async (req, res) => {
   *   try {
   *     const result = await req.proxy({
   *       destination: 'sip:somebody@example.com',
   *       recordRoute: true
   *     });
   *     console.log('Proxy final status:', result.finalStatus);
   *   } catch (err) {
   *     console.error('Proxy failed:', err);
   *   }
   * });
   * ```
   */
  proxy(opts: any): Promise<any>;
  proxy(opts: any, callback: (err: Error | null, results: any) => void): this;
  proxy(opts: any, callback?: any): Promise<any> | this {
    if (this.source !== 'network') {
      throw new Error('Request#proxy can only be used for incoming requests');
    }
    opts = opts || {};

    const destination = opts.destination || this.uri;
    if (typeof destination === 'string') { opts.destination = [destination]; }

    Object.assign(opts, {
      stackTxnId: this.stackTxnId,
      remainInDialog: opts.remainInDialog || opts.path || opts.recordRoute || false,
      provisionalTimeout: opts.provisionalTimeout || '',
      finalTimeout: opts.finalTimeout || '',
      followRedirects: opts.followRedirects || false,
      simultaneous: opts.forking === 'simultaneous',
      fullResponse: true
    });

    opts.destination.forEach((value: string, index: number, array: string[]) => {
      const token = value.split(':');
      if (token[0] !== 'sip' && token[0] !== 'tel') {
        array[index] = 'sip:' + value;
      }
    });

    const result: any = {
      connected: false,
      responses: []
    };

    const __x = (cb: any) => {
      this._agent!.proxy(this, opts, (token: string[], rawMsg: string, meta: any) => {
        if ('NOK' === token[0]) {
          return cb(token[1]);
        }
        if ('done' === token[1]) {
          result.connected = (200 === result.finalStatus);
          return cb(null, result);
        }
        else {
          const address = meta.address;
          const port = +meta.port;
          const msg = new SipMessage(rawMsg);
          const obj = {
            time: meta.time,
            status: msg.status,
            msg: msg
          };
          let len = result.responses.length;
          if (len === 0 || address !== result.responses[len - 1].address || port === result.responses[len - 1].port) {
            result.responses.push({
              address: address,
              port: port,
              msgs:[]
            });
            len++;
          }
          result.responses[len - 1].msgs.push(obj);
          result.finalStatus = msg.status;
          result.finalResponse = obj;
        }
      });
    };

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

  logIn(user: any, options: any, done: any) {
    if (typeof options === 'function') {
      done = options;
      options = {};
    }
    options = options || {};
    done = done || noop;

    let property = 'user';
    if (this._passport && this._passport.instance) {
      property = this._passport.instance._userProperty || 'user';
    }
    const session = (options.session === undefined) ? true : options.session;

    this[property] = user;
    if (session) {
      if (!this._passport) { throw new Error('passport.initialize() middleware not in use'); }
      if (typeof done !== 'function') { throw new Error('req#login requires a callback function'); }

      this._passport.instance.serializeUser(user, this, (err: any, obj: any) => {
        if (err) { this[property] = null; return done(err); }
        if (!this._passport.session) {
          this._passport.session = {};
        }
        this._passport.session.user = obj;
        this.session = this.session || {};
        this.session[this._passport.instance._key] = this._passport.session;
        done();
      });
    } else {
      done();
    }
  }

  logOut() {
    let property = 'user';
    if (this._passport && this._passport.instance) {
      property = this._passport.instance._userProperty || 'user';
    }

    this[property] = null;
    if (this._passport && this._passport.session) {
      delete this._passport.session.user;
    }
  }

  isAuthenticated() {
    let property = 'user';
    if (this._passport && this._passport.instance) {
      property = this._passport.instance._userProperty || 'user';
    }

    return (this[property]) ? true : false;
  }

  isUnauthenticated() {
    return !this.isAuthenticated();
  }
}

delegate(Request.prototype, 'msg')
  .method('get')
  .method('has')
  .method('getHeaderName')
  .method('getParsedHeader')
  .method('set')
  .access('method')
  .access('uri')
  .access('headers')
  .access('body')
  .access('payload')
  .getter('type')
  .getter('raw')
  .getter('callingNumber')
  .getter('callingName')
  .getter('calledNumber')
  .getter('canFormDialog');

export default Request;
