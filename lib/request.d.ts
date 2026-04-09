import { EventEmitter as Emitter } from 'events';
import SipMessage from './sip-parser/message';
import Response from './response';
import DrachtioAgent from './drachtio-agent';
declare namespace Request {
    interface RequestEvents {
        'response': (res: Response, ack: (opts?: any) => void) => void;
        'cancel': (cancelReq: SipMessage) => void;
        'update': (req: Request, res: Response) => void;
        'authenticate': (req: Request) => void;
    }
}
/**
 * Represents an incoming or outgoing SIP Request.
 * Contains properties for inspecting the request (e.g., method, uri, headers, body)
 * and methods for operating on it (e.g., proxying, canceling).
 *
 * @example
 * ```typescript
 * srf.invite((req, res) => {
 *   console.log(`Received ${req.method} from ${req.callingNumber}`);
 *   const to = req.getParsedHeader('To');
 *   console.log('To URI:', to.uri);
 * });
 * ```
 */
declare interface Request {
    on<U extends keyof Request.RequestEvents>(event: U, listener: Request.RequestEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof Request.RequestEvents>(event: U, listener: Request.RequestEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof Request.RequestEvents>(event: U, listener: Request.RequestEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof Request.RequestEvents>(event: U, ...args: Parameters<Request.RequestEvents[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
    /** Get the string value of a SIP header. Returns undefined if not present. */
    get(hdr: string): string | undefined;
    /** Check if the request has a specific SIP header. */
    has(hdr: string): boolean;
    /** Get the properly cased name of a header as it appears in the message. */
    getHeaderName(hdr: string): string | undefined;
    /** Parse and return a Contact header as an array of AOR objects. */
    getParsedHeader(name: 'contact' | 'Contact'): Array<SipMessage.AOR>;
    /** Parse and return a Via header as an array of Via objects. */
    getParsedHeader(name: 'via' | 'Via'): Array<SipMessage.Via>;
    /** Parse and return an address-of-record header (like To, From). */
    getParsedHeader(name: 'To' | 'to' | 'From' | 'from' | 'refer-to' | 'referred-by' | 'p-asserted-identity' | 'remote-party-id'): SipMessage.AOR;
    /** Parse and return an arbitrary SIP header. */
    getParsedHeader(name: string): any;
    /** Parse and return an arbitrary SIP header. */
    getParsedHeader(hdr: string): any;
    /** Set or modify a SIP header. */
    set(hdr: string | Record<string, string>, value?: string): this;
    /** The SIP method (e.g., 'INVITE', 'OPTIONS'). */
    method: string;
    /** The SIP Request-URI. */
    uri: string;
    /** The collection of SIP headers. */
    headers: Record<string, string>;
    /** The body of the request (e.g., SDP). */
    body: string;
    /** For multipart messages, an array of body payloads. */
    payload: SipMessage.Payload[];
    /** The message type ('request' or 'response'). */
    readonly type: string;
    /** The raw, unparsed SIP message string. */
    readonly raw: string;
    /** The calling number (user part of the From header URI). */
    readonly callingNumber: string;
    /** The calling name (display name of the From header). */
    readonly callingName: string;
    /** The called number (user part of the To header URI). */
    readonly calledNumber: string;
    /** True if the method can create a dialog (e.g., INVITE, SUBSCRIBE). */
    readonly canFormDialog: boolean;
}
declare class Request extends Emitter {
    msg: SipMessage;
    _res?: Response;
    _agent?: DrachtioAgent;
    source?: string;
    source_address?: string;
    source_port?: number;
    protocol?: string;
    stackTime?: string;
    stackTxnId?: string;
    stackDialogId?: string;
    server?: any;
    receivedOn?: string;
    sessionToken?: string;
    socket?: any;
    auth?: any;
    _originalParams?: any;
    canceled?: boolean;
    [key: string]: any;
    constructor(msg?: SipMessage, meta?: any);
    get res(): Response | undefined;
    set res(res: Response | undefined);
    get isNewInvite(): boolean;
    get url(): string | undefined;
    set agent(agent: DrachtioAgent | undefined);
    get agent(): DrachtioAgent | undefined;
    set meta(meta: any);
    get meta(): any;
    /**
     * Cancels an outbound request (must be a UAC request).
     *
     * @param opts Additional options to pass to the CANCEL request.
     * @param callback Optional callback.
     */
    cancel(opts?: any, callback?: any): void;
    /**
     * Proxies an incoming request to a specific destination or multiple destinations.
     *
     * @param opts Proxy options including destination, forking strategy, and timeouts.
     * @returns A promise resolving to the final result of the proxy operation.
     *
     * @example
     * ```typescript
     * srf.invite(async (req, res) => {
     *   try {
     *     const result = await req.proxy({
     *       destination: 'sip:somebody@example.com',
     *       recordRoute: true
     *     });
     *     console.log('Proxy final status:', result.finalStatus);
     *   } catch (err) {
     *     console.error('Proxy failed:', err);
     *   }
     * });
     * ```
     */
    proxy(opts: any): Promise<any>;
    proxy(opts: any, callback: (err: Error | null, results: any) => void): this;
    logIn(user: any, options: any, done: any): void;
    logOut(): void;
    isAuthenticated(): boolean;
    isUnauthenticated(): boolean;
}
export default Request;
