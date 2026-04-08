"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const delegates_1 = __importDefault(require("delegates"));
const assert_1 = __importDefault(require("assert"));
const noop = () => { };
const debug_1 = __importDefault(require("debug"));
const message_1 = __importDefault(require("./sip-parser/message"));
const log = (0, debug_1.default)('drachtio:request');
class Request extends events_1.EventEmitter {
    msg;
    _res;
    _agent;
    source;
    source_address;
    source_port;
    protocol;
    stackTime;
    stackTxnId;
    stackDialogId;
    server;
    receivedOn;
    sessionToken;
    socket;
    auth;
    _originalParams;
    canceled;
    constructor(msg, meta) {
        super();
        if (msg) {
            (0, assert_1.default)(msg instanceof message_1.default);
            this.msg = msg;
            if (meta) {
                this.meta = meta;
            }
        }
        else {
            this.msg = new message_1.default();
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
    set meta(meta) {
        log(`Request#set meta ${JSON.stringify(meta)}`);
        this.source = meta.source;
        this.source_address = meta.address;
        this.source_port = meta.port ? parseInt(meta.port) : 5060;
        this.protocol = meta.protocol;
        this.stackTime = meta.time;
        this.stackTxnId = meta.transactionId;
        this.stackDialogId = meta.dialogId;
        if (meta.server)
            this.server = meta.server;
        if (meta.receivedOn)
            this.receivedOn = meta.receivedOn;
        if (meta.sessionToken)
            this.sessionToken = meta.sessionToken;
    }
    get meta() {
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
    cancel(opts, callback) {
        opts = opts || {};
        if (typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        if (!this._agent || this.source !== 'application') {
            throw new Error('Request#cancel can only be used for uac Request');
        }
        this._agent.request(this.socket, Object.assign({
            uri: this.uri,
            method: 'CANCEL',
            stackTxnId: this.stackTxnId
        }, opts), callback);
    }
    proxy(opts, callback) {
        if (this.source !== 'network') {
            throw new Error('Request#proxy can only be used for incoming requests');
        }
        opts = opts || {};
        const destination = opts.destination || this.uri;
        if (typeof destination === 'string') {
            opts.destination = [destination];
        }
        Object.assign(opts, {
            stackTxnId: this.stackTxnId,
            remainInDialog: opts.remainInDialog || opts.path || opts.recordRoute || false,
            provisionalTimeout: opts.provisionalTimeout || '',
            finalTimeout: opts.finalTimeout || '',
            followRedirects: opts.followRedirects || false,
            simultaneous: opts.forking === 'simultaneous',
            fullResponse: true
        });
        opts.destination.forEach((value, index, array) => {
            const token = value.split(':');
            if (token[0] !== 'sip' && token[0] !== 'tel') {
                array[index] = 'sip:' + value;
            }
        });
        const result = {
            connected: false,
            responses: []
        };
        const __x = (cb) => {
            this._agent.proxy(this, opts, (token, rawMsg, meta) => {
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
                    const msg = new message_1.default(rawMsg);
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
                            msgs: []
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
            __x((err, results) => {
                if (err)
                    return reject(err);
                resolve(results);
            });
        });
    }
    logIn(user, options, done) {
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
            if (!this._passport) {
                throw new Error('passport.initialize() middleware not in use');
            }
            if (typeof done !== 'function') {
                throw new Error('req#login requires a callback function');
            }
            this._passport.instance.serializeUser(user, this, (err, obj) => {
                if (err) {
                    this[property] = null;
                    return done(err);
                }
                if (!this._passport.session) {
                    this._passport.session = {};
                }
                this._passport.session.user = obj;
                this.session = this.session || {};
                this.session[this._passport.instance._key] = this._passport.session;
                done();
            });
        }
        else {
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
(0, delegates_1.default)(Request.prototype, 'msg')
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
exports.default = Request;
