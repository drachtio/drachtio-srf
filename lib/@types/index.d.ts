import { Socket } from 'net';
import { EventEmitter } from 'events';

declare namespace Srf {
  type SipMethod = 'ACK' | 'BYE' | 'CANCEL' | 'INFO' | 'INVITE' | 'MESSAGE' | 'NOTIFY' | 'OPTIONS' | 'PRACK' | 'PUBLISH' | 'REFER' | 'REGISTER' | 'SUBSCRIBE' | 'UPDATE';
  type SipMessageHeaders = Record<string, string>;
  type AOR = { name: string; uri: string; params?: Record<string, any>; };
  type Via = { version: string; protocol: string; host: string; port: string; };

  export interface SrfConfig {
    apiSecret?: string;
    host?: string;
    port?: number;
    secret?: string;
  }

  interface ParseUriResult {
    family?: 'ipv6' | 'ipv4';
    scheme: 'sip' | 'sips' | 'tel';
    user?: string;
    password?: string;
    host?: string;
    port?: string;
    params: Record<string, string | null>;
    headers: Record<string, string>;
    context?: string;
  }

  export function parseUri(uri: string): ParseUriResult;
  export function stringifyUri(uri: object): string;

  export interface SipMessage {
    type: "request" | "response";
    body: string;
    payload: object[];
    source: "network" | "application";
    source_address: string;
    source_port: string;
    protocol: string;
    stackTime: string;
    calledNumber: string;
    callingNumber: string;
    raw: string;
    get(name: string): string;
    has(name: string): boolean;
    set(name: string, value: string): void;
    getParsedHeader(name: "contact" | "Contact"): Array<AOR>;
    getParsedHeader(name: "via" | "Via"): Array<Via>;
    getParsedHeader(name: "To" | "to" | "From" | "from" | "refer-to" | "referred-by" | "p-asserted-identity" | "remote-party-id"): AOR;
    getParsedHeader(name: string): string;
  }

  export interface SrfRequest extends SipMessage {
    method: SipMethod;
    get isNewInvite(): boolean
    cancel(callback: (err: any, req: SrfRequest) => void): void;
    on(event: 'response', callback: (res?: SrfResponse, ack?: (opts?: { sdp: string }) => void) => void): void;
    on(event: 'cancel', callback: (res: SipMessage) => void): void;
    branch: string;
    callId: string;
    from: string;
    headers: Record<string, string>;
    msg: any;
    sdp: string;
    srf: any;
    to: string;
    uri: string;
    registration?: {
      type: "unregister" | "register";
      expires: number;
      contact: Array<AOR>;
      aor: string;
    };
  }

  export interface ProxyRequestOptions {
    forking?: 'sequential' | 'simultaneous';
    remainInDialog?: boolean;
    recordRoute?: boolean;
    provisionalTimeout?: string;
    finalTimeout?: string;
    followRedirects?: boolean
  }

  export interface SrfResponse extends SipMessage {
    status: number;
    statusCode: number;
    reason: string;
    finalResponseSent: boolean;
    send(status: number, opts?: object): void;
    send(status: number, reason: string, opts: object): void;
    send(status: number, reason: string, opts: object, callback: (err: any, msg: SipMessage) => void): void;
    end(): void;
  }

  export interface Dialog {
    sip: { callId: string; localTag: string; remoteTag: string; };
    onHold: boolean;
    other: Dialog;
    type: "uac" | "uas";
    local: { uri: string; sdp: string; };
    remote: { uri: string; sdp: string; };
    req: SrfRequest;
    destroy(opts?: { headers: Record<string, string>; }, callback?: (err: any, msg: SrfRequest) => void): void;
    modify(sdp: string, opts?: { noAck: boolean }): Promise<string>;
    modify(opts: { noAck: boolean }): Promise<string>;
    modify(sdp: string, opts?: { noAck: boolean }, callback?: (err: any, msg: SrfResponse) => void): void;
    modify(opts: { noAck: boolean }, callback?: (err: any, resp?: string, resAck?: (sdp: string) => void) => void): void;
    on(messageType: "ack", callback: (msg: SrfRequest) => void): void;
    on(messageType: "destroy", callback: (msg: SrfRequest) => void): void;
    on(messageType: "info", callback: (req: SrfRequest, res: SrfResponse) => void): void;
    on(messageType: "message", callback: (req: SrfRequest, res: SrfResponse) => void): void;
    on(messageType: "modify", callback: (req: SrfRequest, res: SrfResponse) => void): void;
    on(messageType: "notify", callback: (req: SrfRequest, res: SrfResponse) => void): void;
    on(messageType: "options", callback: (req: SrfRequest, res: SrfResponse) => void): void;
    on(messageType: "refer", callback: (req: SrfRequest, res: SrfResponse) => void): void;
    on(messageType: "refresh", callback: (msg: SrfRequest) => void): void;
    on(messageType: "update", callback: (req: SrfRequest, res: SrfResponse) => void): void;
    on(messageType: "modify", callback: (req: SrfRequest, res: SrfResponse) => void): void;
    once(messageType: string, callback: (msg: SrfResponse) => void): void;
    listeners(messageType: string): any[];
    request(opts?: SrfRequest): Promise<SrfResponse>;
    request(opts: SrfRequest, callback?: (err: any, msg: SrfResponse) => void): void;
  }

  export interface CreateUASOptions {
    localSdp: string;
    headers?: SipMessageHeaders;
  }

  export interface CreateUACOptions {
    headers?: SipMessageHeaders;
    uri?: string;
    noAck?: boolean;
    localSdp?: string;
    proxy?: string;
    auth?: { username: string; password: string; };
  }

  export interface CreateB2BUAOptions {
    headers?: SipMessageHeaders;
    responseHeaders?: SipMessageHeaders | ((uacRes: SipMessageHeaders, headers: SipMessageHeaders) => SipMessageHeaders | null);
    localSdpA?: string | ((sdp: string, res: SrfResponse) => string | Promise<string>);
    localSdpB?: string | ((sdp: string) => string | Promise<string>);
    proxyRequestHeaders?: string[];
    proxyResponseHeaders?: string[];
    passFailure?: boolean;
    passProvisionalResponses?: boolean;
    proxy?: string;
    auth?: { username: string; password: string; };
  }

  export class Srf extends EventEmitter {
    constructor();
    constructor(tags: string | string[]);
    connect(config?: SrfConfig): Promise<void>;
    disconnect(): void;
    use(callback: (req: SrfRequest, res: SrfResponse, next: Function) => void): void;
    use(messageType: string, callback: (req: SrfRequest, res: SrfResponse, next: Function) => void): void;
    invite(callback: (req: SrfRequest, res: SrfResponse) => void): void;
    request(uri: string, opts: SrfRequest, method: SipMethod, [body]: string[]): Promise<SrfRequest>;
    request(uri: string, opts: SrfRequest, method: SipMethod, [body]: string[], callback?: (err: any, requestSent: SrfRequest) => void): void;
    proxyRequest(req: SrfRequest, destination: string | string[], opts?: ProxyRequestOptions, callback?: (err: any, results: string) => void): void;
    createUAS(req: SrfRequest, res: SrfResponse, opts: CreateUASOptions): Promise<Dialog>;
    createUAS(req: SrfRequest, res: SrfResponse, opts: CreateUASOptions, callback?: (err: any, dialog: Dialog) => void): this;
    createUAC(uri: string | CreateUACOptions, opts?: CreateUACOptions, progressCallbacks?: { cbRequest?: (req: SrfRequest) => void; cbProvisional?: (provisionalRes: SrfResponse) => void; }): Promise<Dialog>;
    createUAC(uri: string | CreateUACOptions, opts?: CreateUACOptions, progressCallbacks?: { cbRequest?: (req: SrfRequest) => void; cbProvisional?: (provisionalRes: SrfResponse) => void; }, callback?: (err: any, dialog: Dialog) => void): this;
    createB2BUA(req: SrfRequest, res: SrfResponse, uri: string, opts: CreateB2BUAOptions, progressCallbacks?: { cbRequest?: (req: SrfRequest) => void; cbProvisional?: (provisionalRes: Response) => void; cbFinalizedUac?: (uac: Dialog) => void; }): Promise<{ uas: Dialog; uac: Dialog }>;
    createB2BUA(req: SrfRequest, res: SrfResponse, uri: string, opts: CreateB2BUAOptions, progressCallbacks?: { cbRequest?: (req: SrfRequest) => void; cbProvisional?: (provisionalRes: Response) => void; cbFinalizedUac?: (uac: Dialog) => void; }, callback?: (err: any, dialog: Dialog) => void): this;
    on(event: 'connect', listener: (err: Error, hostPort: string) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'disconnect', listener: () => void): this;
    on(event: 'message', listener: (req: SrfRequest, res: SrfResponse) => void): this;
    on(event: 'request', listener: (req: SrfRequest, res: SrfResponse) => void): this;
    on(event: 'register' | 'invite' | 'bye' | 'cancel' | 'ack' | 'info' | 'notify' | 'options' | 'prack' | 'publish' | 'refer' | 'subscribe' | 'update', listener: (req: SrfRequest, res: SrfResponse) => void): this;
    on(event: 'cdr:attempt', listener: (source: string, time: string, msg: SipMessage) => void): this;
    on(event: 'cdr:start', listener: (source: string, time: string, role: string, msg: SipMessage) => void): this;
    on(event: 'cdr:stop', listener: (source: string, time: string, reason: string, msg: SipMessage) => void): this;
    locals: { [name: string]: any };
    socket: Socket;
  }
}

export = Srf.Srf;
