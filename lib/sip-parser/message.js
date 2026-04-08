"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const only_1 = __importDefault(require("only"));
const parser = __importStar(require("./parser"));
/**
 * Represents the fundamental SIP message structure (either request or response).
 * Underlying class for `Request` and `Response`.
 */
class SipMessage {
    headers;
    raw;
    method;
    version;
    status;
    reason;
    uri;
    body;
    payload;
    constructor(msg) {
        this.headers = {};
        if (msg) {
            if (typeof msg === 'string') {
                this.raw = msg;
                const obj = parser.parseSipMessage(msg, true);
                if (!obj)
                    throw new Error('failed to parse sip message');
                msg = obj;
            }
            Object.assign(this.headers, msg.headers || {});
            Object.assign(this, (0, only_1.default)(msg, 'body method version status reason uri payload'));
        }
    }
    get type() {
        if (this.method)
            return 'request';
        if (this.status)
            return 'response';
        return 'unknown';
    }
    get calledNumber() {
        if (!this.uri)
            return '';
        const user = this.uri.match(/sips?:(.*?)@/);
        if (user && user.length > 1) {
            return user[1].split(';')[0];
        }
        return '';
    }
    get callingNumber() {
        const header = this.has('p-asserted-identity') ? this.get('p-asserted-identity') : this.get('from');
        if (!header)
            return '';
        const user = header.match(/sips?:(.*?)@/);
        if (user && user.length > 1) {
            return user[1].split(';')[0];
        }
        return '';
    }
    get callingName() {
        const header = this.has('p-asserted-identity') ? this.get('p-asserted-identity') : this.get('from');
        if (!header)
            return '';
        const user = header.match(/^"(.+)"\s*<sips?:.+@/);
        if (user && user.length > 1) {
            return user[1];
        }
        return '';
    }
    get canFormDialog() {
        if (this.method !== 'INVITE' && this.method !== 'SUBSCRIBE')
            return false;
        const to = this.get('to');
        if (!to)
            return false;
        try {
            const parsedTo = this.getParsedHeader('to');
            return !parsedTo.params || !parsedTo.params.tag;
        }
        catch {
            return false;
        }
    }
    getHeaderName(hdr) {
        const hdrLowerCase = hdr.toLowerCase();
        return Object.keys(this.headers).find((h) => h.toLowerCase() === hdrLowerCase);
    }
    set(hdr, value) {
        const hdrs = {};
        if (typeof hdr === 'string') {
            if (value !== undefined)
                hdrs[hdr] = value;
        }
        else {
            Object.assign(hdrs, hdr);
        }
        Object.keys(hdrs).forEach((key) => {
            const name = parser.getHeaderName(key) || key;
            const newValue = hdrs[key];
            let v = '';
            if (name in this.headers) {
                v += this.headers[name];
                v += ',';
            }
            v += newValue;
            this.headers[name] = v;
        });
        return this;
    }
    get(hdr) {
        const mapped = parser.getHeaderName(hdr) || hdr;
        const headerName = this.getHeaderName(mapped);
        if (headerName) {
            return this.headers[headerName];
        }
    }
    has(hdr) {
        return !!this.getHeaderName(hdr);
    }
    getParsedHeader(hdr) {
        const v = this.get(hdr);
        if (!v) {
            const callId = this.get('Call-ID') || 'unknown';
            throw new Error(`header '${hdr}' not available in SIP message with Call-ID: ${callId}`);
        }
        const fn = parser.getParser(hdr.toLowerCase());
        return fn({ s: v, i: 0 });
    }
    toString() {
        return parser.stringifySipMessage(this);
    }
    static parseUri = parser.parseUri;
}
module.exports = SipMessage;
