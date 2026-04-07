import Dialog from './dialog';
import { EventEmitter as Emitter } from 'events';
import * as parser from './sip-parser/parser';
import SipError from './sip_error';
import net from 'net';
import SipMessage from './sip-parser/message';
import Request from './request';
import Response from './response';
declare class DialogState {
    static Trying: string;
    static Proceeding: string;
    static Early: string;
    static Confirmed: string;
    static Terminated: string;
    static Rejected: string;
    static Cancelled: string;
}
declare class DialogDirection {
    static Initiator: string;
    static Recipient: string;
}
import tls from 'tls';
declare namespace Srf {
    interface CreateUASOptions {
        localSdp?: string | (() => string | Promise<string>);
        headers?: Record<string, string>;
        dialogStateEmitter?: Emitter;
        body?: string | (() => string | Promise<string>);
    }
    interface CreateUACOptions {
        headers?: Record<string, string>;
        uri?: string;
        noAck?: boolean;
        localSdp?: string;
        proxy?: string;
        auth?: {
            username: string;
            password: string;
        } | ((req: Request, res: Response, callback: any) => void);
        method?: string;
        calledNumber?: string;
        callingNumber?: string;
        callingName?: string;
        followRedirects?: boolean;
        keepUriOnRedirect?: boolean;
        dialogStateEmitter?: Emitter;
        _socket?: net.Socket | tls.TLSSocket;
        signal?: AbortSignal;
    }
    interface CreateB2BUAOptions {
        headers?: Record<string, string>;
        responseHeaders?: Record<string, string> | ((uacRes: any, headers: Record<string, string>) => Record<string, string> | null);
        localSdpA?: string | ((sdp: string, res: Response) => string | Promise<string>);
        localSdpB?: string | ((sdp: string) => string | Promise<string>);
        proxyRequestHeaders?: string[];
        proxyResponseHeaders?: string[];
        passFailure?: boolean;
        passProvisionalResponses?: boolean;
        proxy?: string;
        auth?: {
            username: string;
            password: string;
        } | ((req: Request, res: Response, callback: any) => void);
        uri?: string;
        noAck?: boolean;
        dialogStateEmitter?: Emitter;
        method?: string;
        callingNumber?: string;
        callingName?: string;
        calledNumber?: string;
        localSdp?: string;
        _socket?: any;
        signal?: AbortSignal;
    }
    interface ProxyRequestOptions {
        destination?: string | string[];
        forking?: 'sequential' | 'simultaneous' | 'parallel';
        remainInDialog?: boolean;
        recordRoute?: boolean;
        path?: boolean;
        provisionalTimeout?: string;
        finalTimeout?: string;
        followRedirects?: boolean;
        simultaneous?: boolean;
        fullResponse?: boolean;
    }
    interface SrfConfig {
        host?: string;
        port?: number;
        secret?: string;
        tls?: any;
        reconnect?: any;
        enablePing?: boolean;
        pingInterval?: string | number;
        tags?: string[];
    }
    interface ProgressCallbacks {
        cbRequest?: (err: Error | null, req: Request) => void;
        cbProvisional?: (res: Response) => void;
        cbFinalizedUac?: (uac: Dialog) => void;
    }
    interface OutboundRequestOptions {
        method: string;
        headers?: Record<string, string>;
        body?: string;
        auth?: {
            username: string;
            password: string;
        } | ((req: Request, res: Response, callback: any) => void);
        proxy?: string;
    }
}
interface SrfEvents {
    'connect': (err: Error | null, hostport: string, serverVersion?: string, localHostports?: string) => void;
    'error': (err: Error, socket?: any) => void;
    'disconnect': () => void;
    'message': (req: Request, res: Response) => void;
    'request': (req: Request, res: Response) => void;
    'register': (req: Request, res: Response) => void;
    'invite': (req: Request, res: Response) => void;
    'bye': (req: Request, res: Response) => void;
    'cancel': (req: Request, res: Response) => void;
    'ack': (req: Request, res: Response) => void;
    'info': (req: Request, res: Response) => void;
    'notify': (req: Request, res: Response) => void;
    'options': (req: Request, res: Response) => void;
    'prack': (req: Request, res: Response) => void;
    'publish': (req: Request, res: Response) => void;
    'refer': (req: Request, res: Response) => void;
    'subscribe': (req: Request, res: Response) => void;
    'update': (req: Request, res: Response) => void;
    'cdr:attempt': (source: string, time: string, msg: SipMessage) => void;
    'cdr:start': (source: string, time: string, role: string, msg: SipMessage) => void;
    'cdr:stop': (source: string, time: string, reason: string, msg: SipMessage) => void;
    'listening': () => void;
    'reconnecting': () => void;
    'close': () => void;
    [key: string]: (...args: any[]) => void;
}
declare interface Srf {
    on<U extends keyof SrfEvents>(event: U, listener: SrfEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof SrfEvents>(event: U, listener: SrfEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof SrfEvents>(event: U, listener: SrfEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof SrfEvents>(event: U, ...args: Parameters<SrfEvents[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
    locals: Record<string, any>;
    readonly idle: boolean;
    endSession(msg: Request | Response): void;
    disconnect(socket?: any): void;
    set(prop: string, val: any): void;
    get(prop: string): any;
    use(fn: (req: Request, res: Response, next: Function) => void): this;
    use(path: string, fn: (req: Request, res: Response, next: Function) => void): this;
    invite(handler: (req: Request, res: Response, next: Function) => void): this;
    invite(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    register(handler: (req: Request, res: Response, next: Function) => void): this;
    register(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    bye(handler: (req: Request, res: Response, next: Function) => void): this;
    bye(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    cancel(handler: (req: Request, res: Response, next: Function) => void): this;
    cancel(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    ack(handler: (req: Request, res: Response, next: Function) => void): this;
    ack(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    info(handler: (req: Request, res: Response, next: Function) => void): this;
    info(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    notify(handler: (req: Request, res: Response, next: Function) => void): this;
    notify(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    options(handler: (req: Request, res: Response, next: Function) => void): this;
    options(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    prack(handler: (req: Request, res: Response, next: Function) => void): this;
    prack(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    publish(handler: (req: Request, res: Response, next: Function) => void): this;
    publish(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    refer(handler: (req: Request, res: Response, next: Function) => void): this;
    refer(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    subscribe(handler: (req: Request, res: Response, next: Function) => void): this;
    subscribe(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    update(handler: (req: Request, res: Response, next: Function) => void): this;
    update(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    message(handler: (req: Request, res: Response, next: Function) => void): this;
    message(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
}
declare class Srf extends Emitter {
    _dialogs: Map<string, Dialog>;
    _tags: string[];
    _app: any;
    locals: Record<string, any>;
    [key: string]: any;
    constructor(app?: any);
    get app(): any;
    connect(opts: any, callback?: any): any;
    listen(opts: any, callback?: any): any;
    dialog(opts?: any): (req: any, res: any, next: any) => void;
    createUAS(req: Request, res: Response, opts?: Srf.CreateUASOptions): Promise<Dialog>;
    createUAS(req: Request, res: Response, opts: Srf.CreateUASOptions | undefined, callback: (err: Error | null, dialog: Dialog) => void): this;
    createUAC(uri: string, opts?: Srf.CreateUACOptions, progressCallbacks?: Srf.ProgressCallbacks): Promise<Dialog>;
    createUAC(uri: string, opts?: Srf.CreateUACOptions, progressCallbacks?: Srf.ProgressCallbacks, callback?: (err: Error | null, dialog: Dialog) => void): this;
    createUAC(opts: Srf.CreateUACOptions, progressCallbacks?: Srf.ProgressCallbacks): Promise<Dialog>;
    createUAC(opts: Srf.CreateUACOptions, progressCallbacks?: Srf.ProgressCallbacks, callback?: (err: Error | null, dialog: Dialog) => void): this;
    createB2BUA(req: Request, res: Response, uri: string | Srf.CreateB2BUAOptions, opts?: Srf.CreateB2BUAOptions | any, cbRequest?: any, cbProvisional?: any, callback?: any): Promise<{
        uac: Dialog;
        uas: Dialog;
    }> | this;
    proxyRequest(req: Request, destination: string | string[], opts?: Srf.ProxyRequestOptions): Promise<any>;
    proxyRequest(req: Request, destination: string | string[], opts: Srf.ProxyRequestOptions | undefined, callback: (err: Error | null, results: any) => void): this;
    proxyRequest(req: Request, opts: Srf.ProxyRequestOptions): Promise<any>;
    proxyRequest(req: Request, opts: Srf.ProxyRequestOptions, callback: (err: Error | null, results: any) => void): this;
    request(opts: Srf.OutboundRequestOptions & {
        uri: string;
    }): Promise<Request>;
    request(opts: Srf.OutboundRequestOptions & {
        uri: string;
    }, callback: (err: Error | null, req: Request) => void): this;
    request(uri: string, opts: Srf.OutboundRequestOptions): Promise<Request>;
    request(uri: string, opts: Srf.OutboundRequestOptions, callback: (err: Error | null, req: Request) => void): this;
    request(socket: net.Socket | tls.TLSSocket, uri: string, opts: Srf.OutboundRequestOptions): Promise<Request>;
    request(socket: net.Socket | tls.TLSSocket, uri: string, opts: Srf.OutboundRequestOptions, callback: (err: Error | null, req: Request) => void): this;
    findDialogById(stackDialogId: string): Dialog | undefined;
    findDialogByCallIDAndFromTag(callId: string, tag: string): Dialog | undefined;
    addDialog(dialog: Dialog): void;
    removeDialog(dialog: Dialog): void;
    unregisterForMessages(sipVerb: string): void;
    reregisterForMessages(sipVerb: string): void;
    _b2bRequestWithinDialog(dlg: Dialog, req: any, res: any, proxyRequestHeaders: string[], proxyResponseHeaders: string[], callback?: any): void;
    static get Dialog(): typeof Dialog;
    static get SipError(): typeof SipError;
    static get parseUri(): typeof parser.parseUri;
    static get stringifyUri(): typeof parser.stringifyUri;
    static get SipMessage(): typeof SipMessage;
    static get SipRequest(): typeof Request;
    static get SipResponse(): typeof Response;
    static get DialogState(): typeof DialogState;
    static get DialogDirection(): typeof DialogDirection;
}
export = Srf;
