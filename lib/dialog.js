"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const events_1 = require("events");
const assert_1 = __importDefault(require("assert"));
const only_1 = __importDefault(require("only"));
const sip_methods_1 = __importDefault(require("sip-methods"));
const debug_1 = __importDefault(require("debug"));
const sip_error_1 = __importDefault(require("./sip_error"));
const parser_1 = require("./sip-parser/parser");
const sdp_transform_1 = __importDefault(require("sdp-transform"));
const log = (0, debug_1.default)('drachtio:srf');
class Dialog extends events_1.EventEmitter {
    srf;
    type;
    req;
    res;
    auth;
    agent;
    onHold;
    connected;
    queuedRequests;
    _queueRequests;
    _reinvitesInProgress;
    sip;
    local;
    remote;
    subscriptions;
    _emitter;
    _state;
    other; // Add if used by srf
    constructor(srf, type, opts) {
        super();
        const types = ['uas', 'uac'];
        assert_1.default.ok(-1 !== types.indexOf(type), 'argument \'type\' must be one of ' + types.join(','));
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
            callId: this.res.get('Call-ID'),
            remoteTag: 'uas' === type ?
                this.req.getParsedHeader('from').params.tag : this.res.getParsedHeader('to').params.tag,
            localTag: 'uas' === type ?
                opts.sent.getParsedHeader('to').params.tag : this.req.getParsedHeader('from').params.tag
        };
        this.local = {
            uri: 'uas' === type ? opts.sent.getParsedHeader('Contact')[0].uri : this.req.uri,
            sdp: 'uas' === type ? opts.sent.body : this.req.body,
            contact: 'uas' === type ? opts.sent.get('Contact') : this.req.get('Contact')
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
    get id() {
        return this.res.stackDialogId || '';
    }
    get dialogType() {
        return this.req.method;
    }
    get subscribeEvent() {
        return this.dialogType === 'SUBSCRIBE' ? this.req.get('Event') : null;
    }
    get socket() {
        return this.req.socket;
    }
    set stateEmitter(val) {
        this._emitter = val.emitter;
        this._state = val.state;
    }
    set queueRequests(enqueue) {
        log(`dialog ${this.id}: queueing requests: ${enqueue ? 'ON' : 'OFF'}`);
        this._queueRequests = enqueue;
        if (!enqueue) {
            if (this.queuedRequests.length > 0) {
                setImmediate(() => {
                    log(`dialog ${this.id}: processing ${this.queuedRequests.length} queued requests`);
                    this.queuedRequests.forEach(({ req, res }) => this.handle(req, res));
                    this.queuedRequests = [];
                });
            }
        }
    }
    toJSON() {
        return (0, only_1.default)(this, 'id type sip local remote onHold');
    }
    toString() {
        return this.toJSON().toString();
    }
    getCountOfSubscriptions() {
        return this.subscriptions.length;
    }
    addSubscription(req) {
        const to = req.getParsedHeader('To');
        const u = (0, parser_1.parseUri)(to.uri);
        log(`Dialog#addSubscription: to header: ${JSON.stringify(to)}, uri ${JSON.stringify(u)}`);
        const entity = `${u.user}@${u.host}:${req.get('Event')}`;
        this.subscriptions.push(entity);
        log(`Dialog#addSubscription: adding subscription ${entity}; current count ${this.subscriptions.length}`);
        return this.subscriptions.length;
    }
    removeSubscription(uri, event) {
        const u = (0, parser_1.parseUri)(uri);
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
    destroy(opts, callback) {
        opts = opts || {};
        if (typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        this.queuedRequests = [];
        const removeDialog = (err, res, cb) => {
            this.connected = false;
            this.srf.removeDialog(this);
            if (cb)
                cb(err, res);
            this.removeAllListeners();
        };
        const __x = (cb) => {
            if (this.dialogType === 'INVITE') {
                try {
                    this.agent.request({
                        method: 'BYE',
                        headers: opts.headers || {},
                        stackDialogId: this.id,
                        auth: opts.auth || this.auth,
                        _socket: this.socket
                    }, (err, bye) => {
                        if (err || !bye) {
                            return removeDialog(err, bye, cb);
                        }
                        bye.on('response', () => {
                            removeDialog(err, bye, cb);
                        });
                    });
                }
                catch (err) {
                    removeDialog(err, null, cb);
                }
                if (this._emitter) {
                    Object.assign(this._state, { state: 'terminated' });
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
                    }, (err, notify) => {
                        removeDialog(err, notify, cb);
                    });
                }
                catch (err) {
                    removeDialog(err, null, cb);
                }
            }
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, msg) => {
                if (err)
                    return reject(err);
                resolve(msg);
            });
        });
    }
    modify(sdp, opts, callback) {
        if (typeof sdp === 'object') {
            callback = opts;
            opts = sdp;
            sdp = undefined;
        }
        opts = opts || {};
        if (typeof opts === 'function') {
            callback = opts;
            opts = {};
        }
        log(`opts: ${JSON.stringify(opts)}`);
        function onReInviteComplete(dlg) {
            dlg._reinvitesInProgress.count--;
            const admitOne = dlg._reinvitesInProgress.admitOne.shift();
            if (admitOne)
                setImmediate(admitOne);
        }
        const __x = async (cb) => {
            if (!this.connected)
                return cb(new Error('invalid request to modify a completed dialog'));
            if (this._reinvitesInProgress.count++ > 0) {
                await new Promise((resolve) => this._reinvitesInProgress.admitOne.push(resolve));
                if (!this.connected) {
                    this._reinvitesInProgress.count--;
                    this._reinvitesInProgress.admitOne.forEach((fn) => setImmediate(fn));
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
                    if (typeof sdp === 'string')
                        this.local.sdp = sdp;
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
                    headers: opts.headers ? opts.headers : { 'Contact': this.local.contact }
                }, (err, req) => {
                    if (err) {
                        this._reinvitesInProgress.count--;
                        const admitOne = this._reinvitesInProgress.admitOne.shift();
                        if (admitOne)
                            setImmediate(admitOne);
                        return cb(err);
                    }
                    req.on('response', (response, ack) => {
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
                                    return cb(null, response.body, (ackSdp) => {
                                        ack({ body: ackSdp });
                                        onReInviteComplete(this);
                                    });
                                }
                            }
                            cb(new sip_error_1.default(response.status, response.reason));
                        }
                    });
                });
            }
            catch (err) {
                cb(err);
            }
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, outSdp, ack) => {
                if (err)
                    return reject(err);
                if (ack)
                    resolve({ sdp: outSdp, ack });
                else
                    resolve(outSdp);
            });
        });
    }
    request(opts, callback) {
        assert_1.default.ok(typeof opts.method === 'string' &&
            -1 !== sip_methods_1.default.indexOf(opts.method), '\'opts.method\' is required and must be a SIP method');
        const __x = (cb) => {
            const method = opts.method.toUpperCase();
            try {
                this.agent.request({
                    method: method,
                    stackDialogId: this.id,
                    headers: opts.headers || {},
                    auth: opts.auth || this.auth,
                    _socket: this.socket,
                    body: opts.body
                }, (err, req) => {
                    if (err) {
                        return cb(err);
                    }
                    req.on('response', (response, ack) => {
                        if ('BYE' === method) {
                            this.srf.removeDialog(this);
                        }
                        if ('INVITE' === method && response.status >= 200) {
                            if (response.status > 200 || opts.body || opts.noAck !== true)
                                ack();
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
            }
            catch (err) {
                cb(err);
            }
        };
        if (callback) {
            __x(callback);
            return this;
        }
        return new Promise((resolve, reject) => {
            __x((err, response) => {
                if (err)
                    return reject(err);
                resolve(response);
            });
        });
    }
    handle(req, res) {
        log(`dialog ${this.id}: handle: ${req.method}`);
        if (this._queueRequests === true) {
            log(`dialog ${this.id}: queueing incoming request: ${req.method}`);
            this.queuedRequests.push({ req, res });
            return;
        }
        const eventName = req.method.toLowerCase();
        switch (req.method) {
            case 'BYE': {
                if (this._emitter) {
                    Object.assign(this._state, { state: 'terminated' });
                    this._emitter.emit('stateChange', this._state);
                    this._emitter = undefined;
                }
                let reason = 'normal release';
                if (req.meta.source === 'application') {
                    if (req.has('Reason')) {
                        reason = req.get('Reason');
                        const arr = /text="(.*)"/.exec(reason);
                        if (arr)
                            reason = arr[1];
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
                        const sdp1 = sdp_transform_1.default.parse(this.remote.sdp);
                        const sdp2 = sdp_transform_1.default.parse(req.body);
                        refresh = sdp1.origin.sessionId === sdp2.origin.sessionId &&
                            sdp1.origin.sessionVersion === sdp2.origin.sessionVersion;
                    }
                }
                catch { /* empty */ }
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
                    if (0 === this.listeners(eventName).length)
                        res.send(200);
                    else
                        this.emit(eventName, req, res);
                });
                break;
            case 'UPDATE':
                setImmediate(() => {
                    if (0 === this.listeners(eventName).length)
                        res.send(200, {
                            ...(req.body && this.local.sdp && { body: this.local.sdp })
                        });
                    else
                        this.emit(eventName, req, res);
                });
                break;
            case 'SUBSCRIBE':
                if (req.has('Expires') && 0 === parseInt(req.get('Expires'))) {
                    res.send(202);
                    this.emit('unsubscribe', req, 'unsubscribe');
                }
                else {
                    if (0 === this.listeners('subscribe').length) {
                        res.send(489, 'Bad Event - no dialog handler');
                    }
                    else
                        this.emit('subscribe', req, res);
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
sip_methods_1.default.forEach((method) => {
    Dialog.prototype[method.toLowerCase()] = function (opts, cb) {
        opts = opts || {};
        opts.method = method;
        return this.request(opts, cb);
    };
});
module.exports = Dialog;
