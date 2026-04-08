"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const events_1 = require("events");
const delegates_1 = __importDefault(require("delegates"));
const sip_status_1 = __importDefault(require("sip-status"));
const only_1 = __importDefault(require("only"));
const noop = () => { };
const assert_1 = __importDefault(require("assert"));
const debug_1 = __importDefault(require("debug"));
const message_1 = __importDefault(require("./sip-parser/message"));
const log = (0, debug_1.default)('drachtio:response');
class Response extends events_1.EventEmitter {
    _agent;
    msg;
    finished;
    _req;
    source;
    source_address;
    source_port;
    protocol;
    stackTime;
    stackTxnId;
    stackDialogId;
    socket;
    constructor(agent) {
        super();
        this._agent = agent;
        this.msg = new message_1.default();
        this.finished = false;
    }
    get req() {
        return this._req;
    }
    set req(req) {
        this._req = req;
        ['call-id', 'cseq', 'from', 'to'].forEach((hdr) => {
            if (req.has(hdr) && !this.has(hdr)) {
                this.msg.set(hdr, req.get(hdr));
            }
        });
    }
    get agent() {
        return this._agent;
    }
    set agent(agent) {
        log('setting agent');
        this._agent = agent;
    }
    set meta(meta) {
        this.source = meta.source;
        this.source_address = meta.address;
        this.source_port = meta.port ? parseInt(meta.port) : 5060;
        this.protocol = meta.protocol;
        this.stackTime = meta.time;
        this.stackTxnId = meta.transactionId;
        this.stackDialogId = meta.dialogId;
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
    set statusCode(code) {
        this.status = code;
    }
    get statusCode() {
        return this.status;
    }
    get finalResponseSent() {
        return this.finished;
    }
    get headersSent() {
        return this.finished;
    }
    /**
     * Sends the SIP response.
     *
     * @param status The SIP status code (e.g., 200).
     * @param reason Optional SIP reason phrase (e.g., 'OK'). If omitted, a standard reason phrase is used.
     * @param opts Optional object containing headers and body.
     * @param callback Optional callback.
     * @param fnPrack Optional callback for when a PRACK is received (for 100rel).
     */
    send(status, reason, opts, callback, fnPrack) {
        if (typeof status !== 'number' || !(status in sip_status_1.default)) {
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
            if (callback)
                callback(new Error('Response#send: final response already sent'));
            return;
        }
        opts = opts || {};
        this.msg.status = this.status = status;
        this.msg.reason = reason || sip_status_1.default[status];
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
            this.emit('end', { status: this.msg.status, reason: this.msg.reason });
        }
    }
    sendAck(dialogId, opts, callback) {
        this._agent.sendAck('ACK', dialogId, this.req, this, opts, callback);
    }
    sendPrack(dialogId, opts, callback) {
        const rack = `${this.get('rseq')} ${this.req.get('cseq')}`;
        opts = opts || {};
        opts.headers = opts.headers || {};
        Object.assign(opts.headers, { 'RAck': rack });
        this._agent.sendAck('PRACK', dialogId, this.req, this, opts, callback);
    }
    toJSON() {
        return (0, only_1.default)(this, 'msg source source_address source_port protocol stackTime stackDialogId stackTxnId');
    }
    removeHeader(hdrName) {
        noop();
    }
    getHeader(hdrName) {
        return this.msg.get(hdrName);
    }
    setHeader(hdrName, hdrValue) {
        return this.msg.set(hdrName, hdrValue);
    }
    end(data, encoding, callback) {
        (0, assert_1.default)(!this.finished, 'call to Response#end after response is finished');
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
(0, delegates_1.default)(Response.prototype, 'msg')
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
module.exports = Response;
