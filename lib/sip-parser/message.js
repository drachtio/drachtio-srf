const only = require('only') ;
const parser = require('./parser') ;

class SipMessage {
  constructor(msg) {

    this.headers = {};

    if (msg) {
      if (typeof msg === 'string') {
        this.raw = msg ;
        const obj = parser.parseSipMessage(msg, true) ;
        if (!obj) throw new Error('failed to parse sip message');
        msg = obj;
      }
      Object.assign(this.headers, msg.headers || {});
      Object.assign(this, only(msg, 'body method version status reason uri payload'));
    }
  }

  get type() {
    if (this.method) return 'request' ;
    else if (this.status) return 'response' ;
  }

  get calledNumber() {
    const user = this.uri.match(/sips?:(.*?)@/) ;
    if (user && user.length > 1) {
      return user[1].split(';')[0] ;
    }
    return '' ;
  }

  get callingNumber() {
    const header = this.has('p-asserted-identity') ? this.get('p-asserted-identity') : this.get('from') ;
    const user  = header.match(/sips?:(.*?)@/) ;
    if (user && user.length > 1) {
      return user[1].split(';')[0] ;
    }
    return '' ;
  }

  get callingName() {
    const header = this.has('p-asserted-identity') ? this.get('p-asserted-identity') : this.get('from') ;
    const user  = header.match(/^\"(.+)\"\s*<sips?:.+@/);
    if (user && user.length > 1) {
      return user[1];
    }
    return '';
  }

  get canFormDialog() {
    return ('INVITE' === this.method || 'SUBSCRIBE' === this.method) && !this.get('to').tag ;
  }

  set(hdr, value) {
    const hdrs = {} ;
    if (typeof hdr === 'string') hdrs[hdr] = value ;
    else {
      Object.assign(hdrs, hdr);
    }

    Object.keys(hdrs).forEach((key) => {
      const name = parser.getHeaderName(key) ;
      const newValue = hdrs[key] ;
      let v = '' ;
      if (name in this.headers) {
        v += this.headers[name] ;
        v += ',' ;
      }
      v += newValue ;
      this.headers[name] = v;
    });

    return this ;
  }

  get(hdr) {
    if (this.has(hdr)) { return this.headers[parser.getHeaderName(hdr)] ; }
  }

  has(hdr) {
    const name = parser.getHeaderName(hdr) ;
    return name in this.headers ;
  }

  getParsedHeader(hdr) {
    const name = parser.getHeaderName(hdr) ;
    const v =  this.headers[name];

    if (!v) {
      throw new Error('header not available');
    }

    const fn = parser.getParser(hdr.toLowerCase()) ;
    return fn({s:v, i:0}) ;
  }

  toString() {
    return parser.stringifySipMessage(this) ;
  }

}

SipMessage.parseUri = parser.parseUri ;


exports = module.exports = SipMessage ;
