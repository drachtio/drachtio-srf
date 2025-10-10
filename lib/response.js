const Emitter = require('events').EventEmitter ;
const delegate = require('delegates') ;
const status_codes = require('sip-status') ;
const only = require('only') ;
const noop = require('node-noop').noop;
const assert = require('assert') ;
const debug = require('debug')('drachtio:response');
const SipMessage = require('./sip-parser/message') ;
class Response extends Emitter {

  constructor(agent) {
    super() ;
    this._agent = agent ;
    this.msg = new SipMessage() ;
    this.finished = false ;
  }

  get req() {
    return this._req ;
  }
  set req(req) {
    this._req = req ;

    //copy over the dialog-specific headers from the associated request
    ['call-id', 'cseq', 'from', 'to'].forEach((hdr) => {
      if (req.has(hdr) && !this.has(hdr)) { this.msg.set(hdr, req.get(hdr)) ; }
    }) ;
  }

  get agent() {
    return this._agent ;
  }

  set agent(agent) {
    debug('setting agent');
    this._agent = agent ;
  }

  set meta(meta) {
    this.source = meta.source ;
    this.source_address = meta.address ;
    this.source_port = meta.port ? parseInt(meta.port) : 5060 ;
    this.protocol = meta.protocol ;
    this.stackTime = meta.time ;
    this.stackTxnId = meta.transactionId ;
    this.stackDialogId = meta.dialogId ;
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
    } ;
  }

  set statusCode(code) {
    this.status = code ;
  }
  get statusCode() {
    return this.status ;
  }

  get finalResponseSent() {
    return this.finished ;
  }
  get headersSent() {
    return this.finished ;
  }

  send(status, reason, opts, callback, fnPrack) {
    if (typeof status !== 'number' || !(status in status_codes)) {
      throw new Error('Response#send: status is required and must be a valid sip response code') ;
    }

    if (typeof reason === 'function') {
      // i.e. res.send(180, fn)
      fnPrack = callback ;
      callback = reason ;
      reason = undefined ;
    }
    else if (typeof reason === 'object') {
      //i.e. res.send(180, {}, fn)
      fnPrack = callback ;
      callback = opts ;
      opts = reason ;
      reason = undefined ;
    }

    if (this.headersSent) {
      // would like to throw an error here, but this may break applications
      // that have been doing so unknowingly (and basically harmlessly since the server discards).
      debug('Response#send: headersSent');
      if (callback) callback(new Error('Response#send: final response already sent'));
      return;
    }

    opts = opts || {} ;

    this.msg.status = this.status = status ;
    this.msg.reason = reason || status_codes[status];

    // allow app to set the tag in To header
    debug(`Res#send opts ${JSON.stringify(opts)}`);
    if (opts.headers && (opts.headers.to || opts.headers['To'])) {
      const to = opts.headers.to || opts.headers['To'];
      delete opts.headers.to;
      delete opts.headers['To'];
      debug(`app wants to set To on response ${to}`);
      const arr = /tag=(.*)/.exec(to);
      if (arr) {
        const tag = arr[1];
        debug(`app is setting tag on To: ${tag}`);
        if (this.msg.headers.to && !this.msg.headers.to.includes('tag=')) {
          this.msg.headers.to += `;tag=${tag}`;
        }
      }
    }

    //TODO: should really not be attaching the headers and body to the response object
    //because we don't necessarily want them to go out on the final if this is a 1xx
    //pass them to sendResponse instead -- caller can explicitly 'set' headers or body on the response if
    //they want them to be sticky
    debug(`Response#send: msg: ${JSON.stringify(this.msg)}`);
    this._agent.sendResponse(this, opts, callback, fnPrack) ;

    if (status >= 200) {
      this.finished = true ;
      this.emit('end', {status: this.msg.status, reason: this.msg.reason});
    }
  }

  sendAck(dialogId, opts, callback) {
    this._agent.sendAck('ACK', dialogId, this.req, this, opts, callback) ;
  }
  sendPrack(dialogId, opts, callback) {
    const rack = `${this.get('rseq').toString()} ${this.req.get('cseq')}` ;
    opts = opts || {} ;
    opts.headers = opts.headers || {} ;
    Object.assign(opts.headers, {'RAck': rack }) ;
    this._agent.sendAck('PRACK', dialogId, this.req, this, opts, callback) ;
  }
  toJSON() {
    return only(this, 'msg source source_address source_port protocol stackTime stackDialogId stackTxnId') ;
  }

  // for compatibility with expressjs res object so we can use passport etc and other frameworks
  removeHeader(hdrName) {
    noop() ;
  }
  getHeader(hdrName) {
    return this.msg.get(hdrName) ;
  }
  setHeader(hdrName, hdrValue) {
    return this.msg.set(hdrName, hdrValue) ;
  }

  end(data, encoding, callback) {
    assert(!this.finished, 'call to Response#end after response is finished') ;

    if (typeof encoding === 'function') {
      callback = encoding ;
      encoding = null ;
    }
    else if (typeof data === 'function') {
      callback = data ;
      encoding = null ;
      data = null ;
    }
    callback = callback || noop ;

    this.send(this.status, data, () => {
      callback() ;
    }) ;
    this.finished = true ;
  }
}

module.exports = Response ;


// end compatibility

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
  .getter('type') ;
