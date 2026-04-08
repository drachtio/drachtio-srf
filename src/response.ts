import { EventEmitter as Emitter } from 'events';
import delegate from 'delegates';
import STATUS_CODES from 'sip-status';
import only from 'only';
const noop = () => {};
import assert from 'assert';
import debug from 'debug';
import SipMessage from './sip-parser/message';

const log = debug('drachtio:response');

declare namespace Response {
  export interface ResponseEvents {
    'end': (info: { status: number, reason?: string }) => void;
    'finish': () => void;
  }
}

declare interface Response {
  on<U extends keyof Response.ResponseEvents>(event: U, listener: Response.ResponseEvents[U]): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once<U extends keyof Response.ResponseEvents>(event: U, listener: Response.ResponseEvents[U]): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  off<U extends keyof Response.ResponseEvents>(event: U, listener: Response.ResponseEvents[U]): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  emit<U extends keyof Response.ResponseEvents>(event: U, ...args: Parameters<Response.ResponseEvents[U]>): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;

  get(hdr: string): string | undefined;
  has(hdr: string): boolean;
  getHeaderName(hdr: string): string | undefined;
  getParsedHeader(name: 'contact' | 'Contact'): Array<SipMessage.AOR>;
  getParsedHeader(name: 'via' | 'Via'): Array<SipMessage.Via>;
  getParsedHeader(name: 'To' | 'to' | 'From' | 'from' | 'refer-to' | 'referred-by' | 'p-asserted-identity' | 'remote-party-id'): SipMessage.AOR;
  getParsedHeader(name: string): any;
  getParsedHeader(hdr: string): any;
  set(hdr: string | Record<string, string>, value?: string): this;

  headers: Record<string, string>;
  body: string;
  payload: any[];
  status: number;
  reason: string;

  readonly raw: string;
  readonly type: string;
}

class Response extends Emitter {
  _agent?: any;
  msg: SipMessage;
  finished: boolean;
  _req?: any;
  source?: string;
  source_address?: string;
  source_port?: number;
  protocol?: string;
  stackTime?: string;
  stackTxnId?: string;
  stackDialogId?: string;
  socket?: any;
  [key: string]: any; // for delegates

  constructor(agent?: any) {
    super();
    this._agent = agent;
    this.msg = new SipMessage();
    this.finished = false;
  }

  get req() {
    return this._req;
  }
  set req(req: any) {
    this._req = req;

    ['call-id', 'cseq', 'from', 'to'].forEach((hdr: string) => {
      if (req.has(hdr) && !this.has(hdr)) { this.msg.set(hdr, req.get(hdr)); }
    });
  }

  get agent() {
    return this._agent;
  }

  set agent(agent: any) {
    log('setting agent');
    this._agent = agent;
  }

  set meta(meta: any) {
    this.source = meta.source;
    this.source_address = meta.address;
    this.source_port = meta.port ? parseInt(meta.port) : 5060;
    this.protocol = meta.protocol;
    this.stackTime = meta.time;
    this.stackTxnId = meta.transactionId;
    this.stackDialogId = meta.dialogId;
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

  set statusCode(code: number) {
    this.status = code;
  }
  get statusCode(): number {
    return this.status as number;
  }

  get finalResponseSent(): boolean {
    return this.finished;
  }
  get headersSent(): boolean {
    return this.finished;
  }

  send(status: number, reason?: any, opts?: any, callback?: any, fnPrack?: any) {
    if (typeof status !== 'number' || !(status in STATUS_CODES)) {
      throw new Error('Response#send: status is required and must be a valid sip response code');
    }

    if (typeof reason === 'function') {
      fnPrack = callback;
      callback = reason;
      reason = undefined;
    }
    else if (typeof reason === 'object') {
      fnPrack = callback;
      callback = opts;
      opts = reason;
      reason = undefined;
    }

    if (this.headersSent) {
      log('Response#send: headersSent');
      if (callback) callback(new Error('Response#send: final response already sent'));
      return;
    }

    opts = opts || {};

    this.msg.status = this.status = status;
    this.msg.reason = reason || STATUS_CODES[status];

    log(`Res#send opts ${JSON.stringify(opts)}`);
    if (opts.headers && (opts.headers.to || opts.headers['To'])) {
      const to = opts.headers.to || opts.headers['To'];
      delete opts.headers.to;
      delete opts.headers['To'];
      log(`app wants to set To on response ${to}`);
      const arr = /tag=(.*)/.exec(to);
      if (arr) {
        const tag = arr[1];
        log(`app is setting tag on To: ${tag}`);
        if (this.msg.headers.to && !this.msg.headers.to.includes('tag=')) {
          this.msg.headers.to += `;tag=${tag}`;
        }
      }
    }

    log(`Response#send: msg: ${JSON.stringify(this.msg)}`);
    this._agent.sendResponse(this, opts, callback, fnPrack);

    if (status >= 200) {
      this.finished = true;
      this.emit('end', {status: this.msg.status, reason: this.msg.reason});
    }
  }

  sendAck(dialogId: string, opts?: any, callback?: any) {
    this._agent.sendAck('ACK', dialogId, this.req, this, opts, callback);
  }
  sendPrack(dialogId: string, opts?: any, callback?: any) {
    const rack = `${this.get('rseq')} ${this.req.get('cseq')}`;
    opts = opts || {};
    opts.headers = opts.headers || {};
    Object.assign(opts.headers, {'RAck': rack });
    this._agent.sendAck('PRACK', dialogId, this.req, this, opts, callback);
  }
  toJSON() {
    return only(this, 'msg source source_address source_port protocol stackTime stackDialogId stackTxnId');
  }

  removeHeader(hdrName: string) {
    noop();
  }
  getHeader(hdrName: string) {
    return this.msg.get(hdrName);
  }
  setHeader(hdrName: string, hdrValue: any) {
    return this.msg.set(hdrName, hdrValue);
  }

  end(data?: any, encoding?: any, callback?: any) {
    assert(!this.finished, 'call to Response#end after response is finished');

    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = null;
    }
    else if (typeof data === 'function') {
      callback = data;
      encoding = null;
      data = null;
    }
    callback = callback || noop;

    this.send(this.statusCode, data, () => {
      callback();
    });
    this.finished = true;
  }
}

delegate(Response.prototype, 'msg')
  .method('get')
  .method('has')
  .method('getHeaderName')
  .method('getParsedHeader')
  .method('set')
  .access('headers')
  .access('body')
  .access('payload')
  .access('status')
  .access('reason')
  .getter('raw')
  .getter('type');

export = Response;
