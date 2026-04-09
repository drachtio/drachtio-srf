import Dialog from './dialog';
import { EventEmitter as Emitter } from 'events';
import * as parser from './sip-parser/parser';
import net from 'net';
import Request from './request';
import Response from './response';
/**
 * Enumeration of possible dialog states.
 */
declare class _DialogState {
    static Trying: string;
    static Proceeding: string;
    static Early: string;
    static Confirmed: string;
    static Terminated: string;
    static Rejected: string;
    static Cancelled: string;
}
/**
 * Enumeration of dialog directions.
 */
declare class _DialogDirection {
    static Initiator: string;
    static Recipient: string;
}
import tls from 'tls';
declare namespace Srf {
    type SipRequest = Request;
    const SipRequest: typeof Request;
    type SipResponse = Response;
    const SipResponse: typeof Response;
    type SipMessage = import('./sip-parser/message');
    const SipMessage: typeof import('./sip-parser/message');
    type Dialog = import('./dialog');
    const Dialog: typeof import('./dialog');
    type SipError = import('./sip_error');
    const SipError: typeof import('./sip_error');
    const parseUri: typeof parser.parseUri;
    const stringifyUri: typeof parser.stringifyUri;
    type DialogState = typeof _DialogState;
    const DialogState: typeof _DialogState;
    type DialogDirection = typeof _DialogDirection;
    const DialogDirection: typeof _DialogDirection;
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
    /**
     * Options for creating a UAS (User Agent Server) dialog.
     */
    interface CreateUASOptions {
        /** The local SDP to send in the response. Can be a string, or a function that returns a string or a Promise of a string. */
        localSdp?: string | (() => string | Promise<string>);
        /** SIP Headers to include in the response. */
        headers?: Record<string, string | number | undefined>;
        /** Optional event emitter to listen for dialog state changes. */
        dialogStateEmitter?: Emitter;
        /** The body of the response (typically SDP, similar to localSdp). */
        body?: string | (() => string | Promise<string>);
    }
    /**
     * Options for creating a UAC (User Agent Client) dialog.
     */
    interface CreateUACOptions {
        /** SIP Headers to include in the request. */
        headers?: Record<string, string | number | undefined>;
        /** The SIP URI to send the request to. */
        uri?: string;
        /** If true, do not automatically send an ACK when a 200 OK is received (used in 3PCC). */
        noAck?: boolean;
        /** The local SDP to include in the request. */
        localSdp?: string;
        /** The SIP URI of the proxy to use. */
        proxy?: string;
        /** Authentication credentials or callback for digest authentication. */
        auth?: {
            username: string;
            password: string;
        } | ((req: Request, res: Response, callback: any) => void);
        /** The SIP method to use (defaults to INVITE). */
        method?: string;
        /** The called number (used in constructing the request URI). */
        calledNumber?: string;
        /** The calling number (used in constructing the From header). */
        callingNumber?: string;
        /** The calling name (used in constructing the From header). */
        callingName?: string;
        /** If true, automatically follow 3xx redirects. */
        followRedirects?: boolean;
        /** If true, keep the original request URI when following redirects, but set the proxy. */
        keepUriOnRedirect?: boolean;
        /** Optional event emitter to listen for dialog state changes. */
        dialogStateEmitter?: Emitter;
        /** Internal socket reference. */
        _socket?: net.Socket | tls.TLSSocket;
        /** AbortSignal to cancel the outbound request. */
        signal?: AbortSignal;
    }
    /**
     * Options for creating a Back-to-Back User Agent (B2BUA).
     */
    interface CreateB2BUAOptions {
        /** Additional SIP Headers to include in the UAC request. */
        headers?: Record<string, string | number | undefined>;
        /** Response headers to include when forwarding the response back to the UAS leg. */
        responseHeaders?: Record<string, string | number | undefined> | ((uacRes: any, headers: Record<string, string | number | undefined>) => Record<string, string | number | undefined> | null);
        /** The local SDP for the A leg (UAS), or a function returning it based on the B leg SDP. */
        localSdpA?: string | ((sdp: string, res: Response) => string | Promise<string>);
        /** The local SDP for the B leg (UAC), or a function returning it. */
        localSdpB?: string | ((sdp: string) => string | Promise<string>);
        /** List of headers to proxy from the incoming request to the outgoing request. 'all' copies all non-routing headers. */
        proxyRequestHeaders?: string[];
        /** List of headers to proxy from the incoming response to the outgoing response. */
        proxyResponseHeaders?: string[];
        /** Whether to pass non-success responses back to the A leg (default: true). */
        passFailure?: boolean;
        /** Whether to pass provisional (1xx) responses back to the A leg (default: true). */
        passProvisionalResponses?: boolean;
        /** The SIP URI of the proxy to use for the B leg. */
        proxy?: string;
        /** Authentication credentials or callback for digest authentication on the B leg. */
        auth?: {
            username: string;
            password: string;
        } | ((req: Request, res: Response, callback: any) => void);
        /** The SIP URI to send the UAC request to. */
        uri?: string;
        /** If true, do not automatically send an ACK when a 200 OK is received (useful in 3PCC). */
        noAck?: boolean;
        /** Optional event emitter to listen for dialog state changes. */
        dialogStateEmitter?: Emitter;
        /** The SIP method to use (defaults to the method of the incoming request). */
        method?: string;
        /** The calling number (used in constructing the From header). */
        callingNumber?: string;
        /** The calling name (used in constructing the From header). */
        callingName?: string;
        /** The called number (used in constructing the request URI). */
        calledNumber?: string;
        /** The local SDP for the B leg. */
        localSdp?: string;
        /** Internal socket reference. */
        _socket?: any;
        /** AbortSignal to cancel the UAC request. */
        signal?: AbortSignal;
    }
    /**
     * Options for proxying an incoming request.
     */
    interface ProxyRequestOptions {
        /** The destination URI(s) to proxy the request to. */
        destination?: string | string[];
        /** Forking strategy if multiple destinations are provided: 'sequential', 'simultaneous', or 'parallel'. */
        forking?: 'sequential' | 'simultaneous' | 'parallel';
        /** Whether the proxy should remain in the dialog path (insert Record-Route). */
        remainInDialog?: boolean;
        /** Explicitly set Record-Route. */
        recordRoute?: boolean;
        /** Add a Path header for registrations. */
        path?: boolean;
        /** Timeout (e.g., '10s') for provisional responses. */
        provisionalTimeout?: string;
        /** Timeout (e.g., '30s') for final responses. */
        finalTimeout?: string;
        /** Whether to follow 3xx redirects automatically. */
        followRedirects?: boolean;
        /** Alias for forking='simultaneous'. */
        simultaneous?: boolean;
        /** Whether to return the full response object instead of just passing it through. */
        fullResponse?: boolean;
    }
    /**
     * Options for configuring the Srf server connection.
     */
    interface SrfConfig {
        /** The host or IP address to connect to (if connecting to a standalone drachtio server). */
        host?: string;
        /** The port to connect to. */
        port?: number;
        /** The shared secret for authenticating with the drachtio server. */
        secret?: string;
        /** TLS connection options. */
        tls?: any;
        /** Reconnection policies. */
        reconnect?: any;
        /** Whether to enable pinging to keep the connection alive. */
        enablePing?: boolean;
        /** The interval in milliseconds to send pings. */
        pingInterval?: string | number;
        /** Array of string tags to identify this application. */
        tags?: string[];
    }
    /**
     * Callbacks for tracking the progress of an outbound request.
     */
    interface ProgressCallbacks {
        /** Called when the request has been sent. */
        cbRequest?: (err: Error | null, req: Request) => void;
        /** Called when a provisional response (1xx) is received. */
        cbProvisional?: (res: Response) => void;
        /** Called when the UAC dialog has been finalized (usually after a 2xx response). */
        cbFinalizedUac?: (uac: Dialog) => void;
    }
    /**
     * Options for sending an arbitrary outbound SIP request.
     */
    interface OutboundRequestOptions {
        /** The SIP method to use (e.g., 'OPTIONS', 'INFO'). */
        method: string;
        /** SIP Headers to include in the request. */
        headers?: Record<string, string | number | undefined>;
        /** The body of the request. */
        body?: string;
        /** Authentication credentials or callback for digest authentication. */
        auth?: {
            username: string;
            password: string;
        } | ((req: Request, res: Response, callback: any) => void);
        /** The SIP URI of the proxy to use. */
        proxy?: string;
    }
}
/**
 * The main application class for drachtio-srf.
 * Provides an Express-like middleware routing mechanism for incoming SIP requests,
 * as well as methods for creating dialogs, proxying requests, and sending outbound requests.
 *
 * @example
 * ```typescript
 * const Srf = require('drachtio-srf');
 * const srf = new Srf();
 * srf.connect({ host: '127.0.0.1', port: 9022, secret: 'cymru' });
 *
 * srf.invite((req, res) => {
 *   srf.createUAS(req, res, { localSdp: '...' })
 *     .then(dialog => console.log('Dialog established!'));
 * });
 * ```
 */
declare interface Srf {
    on<U extends keyof Srf.SrfEvents>(event: U, listener: Srf.SrfEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof Srf.SrfEvents>(event: U, listener: Srf.SrfEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof Srf.SrfEvents>(event: U, listener: Srf.SrfEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof Srf.SrfEvents>(event: U, ...args: Parameters<Srf.SrfEvents[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
    locals: Record<string, any>;
    readonly idle: boolean;
    /** Terminate a session using the provided SIP message. */
    endSession(msg: Request | Response): void;
    /** Disconnect from the drachtio server. */
    disconnect(socket?: any): void;
    /** Set an application-level property. */
    set(prop: string, val: any): void;
    /** Get an application-level property. */
    get(prop: string): any;
    /** Use middleware for all incoming requests. */
    use(fn: (req: Request, res: Response, next: Function) => void): this;
    /** Use middleware for incoming requests matching a specific path/method. */
    use(path: string, fn: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming INVITE requests. */
    invite(handler: (req: Request, res: Response, next: Function) => void): this;
    invite(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming REGISTER requests. */
    register(handler: (req: Request, res: Response, next: Function) => void): this;
    register(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming BYE requests. */
    bye(handler: (req: Request, res: Response, next: Function) => void): this;
    bye(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming CANCEL requests. */
    cancel(handler: (req: Request, res: Response, next: Function) => void): this;
    cancel(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming ACK requests. */
    ack(handler: (req: Request, res: Response, next: Function) => void): this;
    ack(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming INFO requests. */
    info(handler: (req: Request, res: Response, next: Function) => void): this;
    info(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming NOTIFY requests. */
    notify(handler: (req: Request, res: Response, next: Function) => void): this;
    notify(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming OPTIONS requests. */
    options(handler: (req: Request, res: Response, next: Function) => void): this;
    options(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming PRACK requests. */
    prack(handler: (req: Request, res: Response, next: Function) => void): this;
    prack(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming PUBLISH requests. */
    publish(handler: (req: Request, res: Response, next: Function) => void): this;
    publish(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming REFER requests. */
    refer(handler: (req: Request, res: Response, next: Function) => void): this;
    refer(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming SUBSCRIBE requests. */
    subscribe(handler: (req: Request, res: Response, next: Function) => void): this;
    subscribe(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming UPDATE requests. */
    update(handler: (req: Request, res: Response, next: Function) => void): this;
    update(path: string, handler: (req: Request, res: Response, next: Function) => void): this;
    /** Route incoming MESSAGE requests. */
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
    /**
     * Connects to a drachtio server.
     * @param opts Connection options (host, port, secret).
     * @param callback Optional callback called when connected.
     */
    connect(opts: any, callback?: any): any;
    /**
     * Starts a local drachtio server listening for connections.
     * @param opts Listen options.
     * @param callback Optional callback called when listening.
     */
    listen(opts: any, callback?: any): any;
    /**
     * Internal middleware to route requests matching an existing dialog.
     */
    dialog(opts?: any): (req: any, res: any, next: any) => void;
    /**
     * Creates a User Agent Server (UAS) dialog by responding to an incoming request (usually an INVITE).
     *
     * @param req The incoming SIP request.
     * @param res The SIP response object.
     * @param opts Options for creating the UAS dialog, including local SDP.
     * @returns A promise resolving to the established Dialog.
     *
     * @example
     * ```typescript
     * srf.invite(async (req, res) => {
     *   try {
     *     const dialog = await srf.createUAS(req, res, {
     *       localSdp: 'v=0\r\no=- 123456 1 IN IP4 127.0.0.1\r\ns=-\r\n...'
     *     });
     *     console.log('UAS dialog created!');
     *   } catch (err) {
     *     console.error('Failed to create UAS dialog', err);
     *   }
     * });
     * ```
     */
    createUAS(req: Request, res: Response, opts?: Srf.CreateUASOptions): Promise<Dialog>;
    createUAS(req: Request, res: Response, opts: Srf.CreateUASOptions | undefined, callback: (err: Error | null, dialog: Dialog) => void): this;
    /**
     * Creates a User Agent Client (UAC) dialog by sending an outbound request.
     *
     * @param uri The destination SIP URI.
     * @param opts Options for creating the UAC dialog.
     * @param progressCallbacks Callbacks for tracking provisional responses and request dispatch.
     * @returns A promise resolving to the established Dialog.
     *
     * @example
     * ```typescript
     * try {
     *   const dialog = await srf.createUAC('sip:1234@example.com', {
     *     localSdp: 'v=0\r\no=- 123456 1 IN IP4 127.0.0.1\r\ns=-\r\n...',
     *     auth: { username: 'user', password: 'password' }
     *   }, {
     *     cbProvisional: (res) => console.log(`Received ${res.status}`)
     *   });
     *   console.log('UAC dialog established!');
     * } catch (err) {
     *   console.error('Failed to create UAC dialog', err);
     * }
     * ```
     */
    createUAC(uri: string, opts?: Srf.CreateUACOptions, progressCallbacks?: Srf.ProgressCallbacks): Promise<Dialog>;
    createUAC(uri: string, opts?: Srf.CreateUACOptions, progressCallbacks?: Srf.ProgressCallbacks, callback?: (err: Error | null, dialog: Dialog) => void): this;
    createUAC(opts: Srf.CreateUACOptions, progressCallbacks?: Srf.ProgressCallbacks): Promise<Dialog>;
    createUAC(opts: Srf.CreateUACOptions, progressCallbacks?: Srf.ProgressCallbacks, callback?: (err: Error | null, dialog: Dialog) => void): this;
    /**
     * Creates a Back-to-Back User Agent (B2BUA) by bridging an incoming request to an outgoing request.
     * Internally creates both a UAS dialog and a UAC dialog and links them together.
     *
     * @param req The incoming SIP request (A leg).
     * @param res The incoming SIP response object.
     * @param uri The destination URI for the outgoing request (B leg).
     * @param opts B2BUA configuration options.
     * @returns A promise resolving to an object containing both { uac, uas } Dialogs.
     *
     * @example
     * ```typescript
     * srf.invite(async (req, res) => {
     *   try {
     *     const { uac, uas } = await srf.createB2BUA(req, res, 'sip:outbound@example.com', {
     *       passFailure: true,
     *       proxyRequestHeaders: ['all'],
     *       proxyResponseHeaders: ['all']
     *     });
     *     console.log('B2BUA established between A and B legs');
     *
     *     uac.on('destroy', () => uas.destroy());
     *     uas.on('destroy', () => uac.destroy());
     *   } catch (err) {
     *     console.error('B2BUA failed', err);
     *   }
     * });
     * ```
     */
    createB2BUA(req: Request, res: Response, uri: string | Srf.CreateB2BUAOptions, opts?: Srf.CreateB2BUAOptions | any, cbRequest?: any, cbProvisional?: any, callback?: any): Promise<{
        uac: Dialog;
        uas: Dialog;
    }> | this;
    /**
     * Proxies an incoming request to one or more destinations.
     * This operates at the transaction level rather than dialog level.
     *
     * @param req The incoming request to proxy.
     * @param destination The destination URI or array of URIs.
     * @param opts Options for proxying.
     * @returns A promise resolving to the result of the proxy operation.
     *
     * @example
     * ```typescript
     * srf.invite(async (req, res) => {
     *   try {
     *     const result = await srf.proxyRequest(req, 'sip:outbound@example.com', {
     *       recordRoute: true,
     *       followRedirects: true
     *     });
     *     console.log('Proxy successful');
     *   } catch (err) {
     *     console.error('Proxy failed', err);
     *   }
     * });
     * ```
     */
    proxyRequest(req: Request, destination: string | string[], opts?: Srf.ProxyRequestOptions): Promise<any>;
    proxyRequest(req: Request, destination: string | string[], opts: Srf.ProxyRequestOptions | undefined, callback: (err: Error | null, results: any) => void): this;
    proxyRequest(req: Request, opts: Srf.ProxyRequestOptions): Promise<any>;
    proxyRequest(req: Request, opts: Srf.ProxyRequestOptions, callback: (err: Error | null, results: any) => void): this;
    /**
     * Sends an arbitrary outbound SIP request (e.g. OPTIONS, INFO, MESSAGE).
     *
     * @param opts Options for the outbound request, containing uri and method.
     * @returns A promise resolving to the sent Request.
     *
     * @example
     * ```typescript
     * try {
     *   const req = await srf.request({
     *     uri: 'sip:someone@example.com',
     *     method: 'MESSAGE',
     *     body: 'Hello world'
     *   });
     *   req.on('response', (res) => console.log('Response status:', res.status));
     * } catch (err) {
     *   console.error(err);
     * }
     * ```
     */
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
    /**
     * Retrieves an active Dialog by its stack dialog ID.
     *
     * @param stackDialogId The ID assigned by the drachtio server.
     * @returns The Dialog instance, or undefined if not found.
     */
    findDialogById(stackDialogId: string): Dialog | undefined;
    /**
     * Retrieves an active Dialog by Call-ID and local From tag.
     *
     * @param callId The Call-ID of the dialog.
     * @param tag The local tag of the dialog.
     * @returns The Dialog instance, or undefined if not found.
     */
    findDialogByCallIDAndFromTag(callId: string, tag: string): Dialog | undefined;
    /**
     * Add a dialog to the active dialogs map.
     * @internal
     */
    addDialog(dialog: Dialog): void;
    /**
     * Remove a dialog from the active dialogs map.
     * @internal
     */
    removeDialog(dialog: Dialog): void;
    unregisterForMessages(sipVerb: string): void;
    reregisterForMessages(sipVerb: string): void;
    _b2bRequestWithinDialog(dlg: Dialog, req: any, res: any, proxyRequestHeaders: string[], proxyResponseHeaders: string[], callback?: any): void;
}
export = Srf;
