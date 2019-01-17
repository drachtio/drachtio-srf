const crypto = require('crypto');

module.exports = class DigestClient {

  constructor(res) {
    this.res = res ;
    this.req = res.req ;
    this.agent = res.agent ;

    this.nc = 0;
  }

  authenticate(callback) {
    var options = this.req._originalParams.options ;

    // get the username and password - either provided directly or via a callback
    var fn ;
    if (typeof options.auth === 'function') {
      fn = options.auth ;
    }
    else if (typeof options.auth === 'object') {
      fn = (req, res, callback) => { return callback(null, options.auth.username, options.auth.password); };
    }
    else {
      callback(new Error('no credentials were supplied to reply to server authentication challenge')) ;
    }

    // note: we pass the original request and the 401 (or whatever) response in case the caller wants to see it
    fn(this.req, this.res, (err, username, password) => {
      if (err) {
        return callback(err);
      }

      var header = this.res.statusCode === 407 ? 'proxy-authenticate' : 'www-authenticate' ;
      var challenge = this._parseChallenge(this.res.get(header));

      var ha1 = crypto.createHash('md5');
      ha1.update([username, challenge.realm, password].join(':'));
      var ha2 = crypto.createHash('md5');
      ha2.update([options.method, options.uri].join(':'));

      // bump CSeq and preserve Call-Id
      var headers = options.headers || {};
      var seq = this.req.getParsedHeader('cseq').seq ;
      seq++ ;
      headers['CSeq'] = '' + seq + ' ' + this.req.method ;
      headers['call-id'] = this.req.get('call-id') ;

      // preserve tag on From header as well
      headers['From'] = this.req.get('from') ;


      // Generate cnonce
      var cnonce = false;
      var nc = false;
      if (typeof challenge.qop === 'string') {
        var cnonceHash = crypto.createHash('md5');
        cnonceHash.update(Math.random().toString(36));
        cnonce = cnonceHash.digest('hex').substr(0, 8);
        nc = this._updateNC();
      }

      // Generate response hash
      var response = crypto.createHash('md5');
      var responseParams = [
        ha1.digest('hex'),
        challenge.nonce
      ];

      if (cnonce) {
        responseParams.push(nc);
        responseParams.push(cnonce);
      }

      if (challenge.qop) {
        responseParams.push(challenge.qop);
      }
      responseParams.push(ha2.digest('hex'));
      response.update(responseParams.join(':'));

      // Setup response parameters
      var authParams = {
        username: username,
        realm: challenge.realm,
        nonce: challenge.nonce,
        uri: options.uri,
        response: response.digest('hex'),
        algorithm: 'MD5'
      };
      if (challenge.qop) { authParams.qop = challenge.qop; }
      if (challenge.opaque) { authParams.opaque = challenge.opaque; }

      if (cnonce) {
        authParams.nc = nc;
        authParams.cnonce = cnonce;
      }

      headers[407 === this.res.statusCode ? 'Proxy-Authorization' : 'Authorization'] = this._compileParams(authParams);

      options.headers = headers;

      // if the original request was sent to a request-uri that looks to have a DNS name, 
      // let's avoid another DNS lookup on the second request -- i.e. when challenged, 
      // we want to send our credentialled request to the same server that challenged us
      const originalUri = options.uri;
      if (!originalUri.match(/sips?:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/)) {
        const proxy = `sip:${this.res.source_address}:${this.res.source_port}`;
        Object.assign(options, {proxy});
      }
      this.agent.request(options, callback) ;
    }) ;
  }

  _updateNC() {
    const max = 99999999;
    this.nc++;
    if (this.nc > max) {
      this.nc = 1;
    }
    const padding = new Array(8).join('0') + '';
    const nc = this.nc + '';
    return padding.substr(0, 8 - nc.length) + nc;
  }

  _compileParams(params) {
    const parts = [];
    for (const i in params) {
      if (['nc', 'algorithm'].includes(i)) parts.push(`${i}=${params[i]}`);
      else parts.push(`${i}="${params[i]}"`);
    }
    return `Digest ${parts.join(',')}`;
  }

  _parseChallenge(digest) {
    const prefix = 'Digest ';
    const challenge = digest.substr(digest.indexOf(prefix) + prefix.length);
    const parts = challenge.split(',');
    const length = parts.length;
    const params = {};
    for (let i = 0; i < length; i++) {
      const part = parts[i].match(/^\s*?([a-zA-Z0-0]+)="?(.*?)"?\s*?$/);
      if (part && part.length > 2) {
        params[part[1]] = part[2];
      }
    }
    return params;
  }
} ;
