import only from 'only';
import * as parser from './parser';

/**
 * Namespace containing types related to SIP messages and parsed headers.
 */
declare namespace SipMessage {
  /** Represents an Address of Record (AOR) often found in To, From, Contact headers. */
  export interface AOR {
    /** Optional display name (e.g., 'Alice'). */
    name?: string;
    /** The SIP URI (e.g., 'sip:alice@example.com'). */
    uri: string;
    /** Key-value parameters attached to the AOR (e.g., tag). */
    params: Record<string, string | number | null>;
  }

  /** Represents a Via header entry. */
  export interface Via {
    /** The SIP version (usually '2.0'). */
    version: string;
    /** The transport protocol (e.g., 'UDP', 'TCP', 'TLS'). */
    protocol: string;
    /** The host or IP address. */
    host: string;
    /** The port number. */
    port?: number;
    /** Key-value parameters (e.g., branch). */
    params: Record<string, string | number | null>;
  }

  /** Represents a fully parsed SIP URI. */
  export interface ParsedUri {
    /** IP family or 'ipv4'/'ipv6'. */
    family: 'ipv4' | 'ipv6';
    /** The URI scheme (e.g., 'sip', 'sips', 'tel'). */
    scheme: string;
    /** The user part of the URI. */
    user?: string;
    /** The password part of the URI. */
    password?: string;
    /** The host or domain. */
    host: string;
    /** The port. */
    port?: number;
    /** Key-value URI parameters. */
    params: Record<string, string | null>;
    /** Key-value URI headers. */
    headers: Record<string, string>;
    /** The number if it's a tel URI. */
    number?: string;
    /** The context if it's a tel URI. */
    context?: string | null;
  }
  export interface Payload {
    /** The content type of this multipart payload element. */
    type: string | null;
    /** The raw content of this multipart payload element. */
    content: string;
  }
}

/**
 * Represents the fundamental SIP message structure (either request or response).
 * Underlying class for `Request` and `Response`.
 */
class SipMessage {
  headers: Record<string, string>;
  raw?: string;
  method?: string;
  version?: string;
  status?: number;
  reason?: string;
  uri?: string;
  body?: string;
  payload?: SipMessage.Payload[];

  constructor(msg?: string | Partial<SipMessage>) {
    this.headers = {};

    if (msg) {
      if (typeof msg === 'string') {
        this.raw = msg;
        const obj = parser.parseSipMessage(msg, true);
        if (!obj) throw new Error('failed to parse sip message');
        msg = obj as Partial<SipMessage>;
      }
      Object.assign(this.headers, (msg as Partial<SipMessage>).headers || {});
      Object.assign(this, only(msg, 'body method version status reason uri payload'));
    }
  }

  get type(): string {
    if (this.method)
      return 'request';
    if (this.status)
      return 'response';
    return 'unknown';
  }

  get calledNumber(): string {
    if (!this.uri) return '';
    const user = this.uri.match(/sips?:(.*?)@/);
    if (user && user.length > 1) {
      return user[1].split(';')[0];
    }
    return '';
  }

  get callingNumber(): string {
    const header = this.has('p-asserted-identity') ? this.get('p-asserted-identity') : this.get('from');
    if (!header) return '';
    const user = header.match(/sips?:(.*?)@/);
    if (user && user.length > 1) {
      return user[1].split(';')[0];
    }
    return '';
  }

  get callingName(): string {
    const header = this.has('p-asserted-identity') ? this.get('p-asserted-identity') : this.get('from');
    if (!header) return '';
    const user = header.match(/^"(.+)"\s*<sips?:.+@/);
    if (user && user.length > 1) {
      return user[1];
    }
    return '';
  }

  get canFormDialog(): boolean {
    if (this.method !== 'INVITE' && this.method !== 'SUBSCRIBE') return false;
    const to = this.get('to');
    if (!to) return false;
    try {
      const parsedTo = this.getParsedHeader('to');
      return !parsedTo.params || !parsedTo.params.tag;
    } catch {
      return false;
    }
  }

  getHeaderName(hdr: string): string | undefined {
    const hdrLowerCase = hdr.toLowerCase();
    return Object.keys(this.headers).find((h) => h.toLowerCase() === hdrLowerCase);
  }

  set(hdr: string | Record<string, string>, value?: string): this {
    const hdrs: Record<string, string> = {};
    if (typeof hdr === 'string') {
      if (value !== undefined) hdrs[hdr] = value;
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

  get(hdr: string): string | undefined {
    const mapped = parser.getHeaderName(hdr) || hdr;
    const headerName = this.getHeaderName(mapped);
    if (headerName) {
      return this.headers[headerName];
    }
  }

  has(hdr: string): boolean {
    return !!this.getHeaderName(hdr);
  }

  getParsedHeader(name: 'contact' | 'Contact'): Array<SipMessage.AOR>;
  getParsedHeader(name: 'via' | 'Via'): Array<SipMessage.Via>;
  getParsedHeader(name: 'To' | 'to' | 'From' | 'from' | 'refer-to' | 'referred-by' | 'p-asserted-identity' | 'remote-party-id'): SipMessage.AOR;
  getParsedHeader(name: string): any;
  getParsedHeader(hdr: string): any {
    const v = this.get(hdr);

    if (!v) {
      const callId = this.get('Call-ID') || 'unknown';
      throw new Error(`header '${hdr}' not available in SIP message with Call-ID: ${callId}`);
    }

    const fn = parser.getParser(hdr.toLowerCase());
    return fn({s: v, i: 0});
  }

  toString(): string {
    return parser.stringifySipMessage(this);
  }

  static parseUri = parser.parseUri;
}

export = SipMessage;
