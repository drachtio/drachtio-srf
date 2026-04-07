import { EventEmitter as Emitter } from 'events';
import delegate from 'delegates';
import assert from 'assert';
import noop from 'node-noop';
import debug from 'debug';
import SipMessage from './sip-parser/message';

const log = debug('drachtio:request');

class Request extends Emitter {
  msg: SipMessage;
  _res?: any;
  _agent?: any;
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
  [key: string]: any; // for delegates and passport

  constructor(msg: SipMessage, meta: any) {
    super();

    if (msg) {
      assert(msg instanceof SipMessage);
      this.msg = msg;
      this.meta = meta;
    } else {
      this.msg = new SipMessage();
    }
  }

  get res() {
    return this._res;
  }
  set res(res) {
    this._res = res;
  }

  get isNewInvite() {
    const to = this.getParsedHeader('to');
    return this.method === 'INVITE' && !('tag' in to.params);
  }

  get url() {
    return this.uri;
  }

  set agent(agent) {
    this._agent = agent;
  }
  get agent() {
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

  cancel(opts?: any, callback?: any): void {
    opts = opts || {};
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    if (!this._agent || this.source !== 'application') {
      throw new Error('Request#cancel can only be used for uac Request');
    }
    this._agent.request(Object.assign(
      {
        _socket: this.socket,
        uri: this.uri,
        method: 'CANCEL',
        stackTxnId: this.stackTxnId
      }, opts),
    callback);
  }

  proxy(opts: any, callback?: any): any {
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

    const __x = (callback: any) => {
      this._agent.proxy(this, opts, (token: string[], rawMsg: string, meta: any) => {
        if ('NOK' === token[0]) {
          return callback(token[1]);
        }
        if ('done' === token[1]) {
          result.connected = (200 === result.finalStatus);
          return callback(null, result);
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

export = Request;
