"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
function parseTransportToken(sipString) {
    if (sipString) {
        const match = sipString.match(/;transport=([^;\s]+)/i);
        if (match)
            return match[1].toLowerCase();
    }
}
/**
 * Internal class handling SIP digest authentication.
 * Automatically processes 401/407 challenges and generates the proper Authorization header.
 * @internal
 */
class DigestClient {
    res;
    req;
    agent;
    nc;
    constructor(res) {
        this.res = res;
        this.req = res.req;
        this.agent = res.agent;
        this.nc = 0;
    }
    authenticate(callback) {
        const options = this.req._originalParams.options;
        let fn;
        if (typeof options.auth === 'function') {
            fn = options.auth;
        }
        else if (typeof options.auth === 'object') {
            fn = (req, res, cb) => { return cb(null, options.auth.username, options.auth.password); };
        }
        else {
            callback(new Error('no credentials were supplied to reply to server authentication challenge'));
            return;
        }
        fn(this.req, this.res, (err, username, password) => {
            if (err) {
                return callback(err);
            }
            const header = this.res.statusCode === 407 ? 'proxy-authenticate' : 'www-authenticate';
            if (!this.res.has(header)) {
                return callback(new Error(`missing ${header} in ${this.res.statusCode} response`));
            }
            const challenge = this._parseChallenge(this.res.get(header));
            const ha1 = crypto_1.default.createHash('md5');
            ha1.update([username, challenge.realm, password].join(':'));
            const ha2 = crypto_1.default.createHash('md5');
            ha2.update([options.method, options.uri].join(':'));
            const headers = options.headers || {};
            let seq = this.req.getParsedHeader('cseq').seq;
            seq++;
            headers['CSeq'] = '' + seq + ' ' + this.req.method;
            headers['call-id'] = this.req.get('call-id');
            delete headers.from;
            headers['From'] = this.req.get('from');
            let cnonce = false;
            let nc = false;
            if (typeof challenge.qop === 'string') {
                const cnonceHash = crypto_1.default.createHash('md5');
                cnonceHash.update(Math.random().toString(36));
                cnonce = cnonceHash.digest('hex').slice(0, 8);
                nc = this._updateNC();
            }
            const response = crypto_1.default.createHash('md5');
            const responseParams = [
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
            const authParams = {
                username: username,
                realm: challenge.realm,
                nonce: challenge.nonce,
                uri: options.uri,
                response: response.digest('hex'),
                algorithm: 'MD5'
            };
            if (challenge.qop) {
                authParams.qop = challenge.qop;
            }
            if (challenge.opaque) {
                authParams.opaque = challenge.opaque;
            }
            if (cnonce) {
                authParams.nc = nc;
                authParams.cnonce = cnonce;
            }
            headers[407 === this.res.statusCode ? 'Proxy-Authorization' : 'Authorization'] = this._compileParams(authParams);
            options.headers = headers;
            const originalUri = options.uri;
            if (!options.proxy &&
                !originalUri.match(/sips?:[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/)) {
                const transport = parseTransportToken(originalUri);
                let proxy = `sip:${this.res.source_address}:${this.res.source_port}`;
                if (transport)
                    proxy += `;transport=${transport}`;
                Object.assign(options, { proxy });
            }
            options._socket = this.res.socket;
            this.agent.request(options, callback);
        });
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
            if (['nc', 'algorithm', 'qop'].includes(i))
                parts.push(`${i}=${params[i]}`);
            else
                parts.push(`${i}="${params[i]}"`);
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
}
exports.default = DigestClient;
