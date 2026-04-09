import { EventEmitter as Emitter } from 'events';
import SipMessage from './sip-parser/message';
declare namespace Response {
    interface ResponseEvents {
        'end': (info: {
            status: number;
            reason?: string;
        }) => void;
        'finish': () => void;
    }
}
/**
 * Represents a SIP Response.
 * Contains properties for inspecting the response and methods for sending a response
 * back to the network.
 *
 * @example
 * ```typescript
 * srf.invite((req, res) => {
 *   // Send a 180 Ringing
 *   res.send(180);
 *   // Later, send a 200 OK with SDP
 *   res.send(200, { body: 'v=0\r\no=-...' });
 * });
 * ```
 */
declare interface Response {
    on<U extends keyof Response.ResponseEvents>(event: U, listener: Response.ResponseEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof Response.ResponseEvents>(event: U, listener: Response.ResponseEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof Response.ResponseEvents>(event: U, listener: Response.ResponseEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof Response.ResponseEvents>(event: U, ...args: Parameters<Response.ResponseEvents[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
    /** Get the string value of a SIP header. Returns undefined if not present. */
    get(hdr: string): string | undefined;
    /** Check if the response has a specific SIP header. */
    has(hdr: string): boolean;
    /** Get the properly cased name of a header as it appears in the message. */
    getHeaderName(hdr: string): string | undefined;
    /** Parse and return a Contact header as an array of AOR objects. */
    getParsedHeader(name: 'contact' | 'Contact'): Array<SipMessage.AOR>;
    /** Parse and return a Via header as an array of Via objects. */
    getParsedHeader(name: 'via' | 'Via'): Array<SipMessage.Via>;
    /** Parse and return an address-of-record header. */
    getParsedHeader(name: 'To' | 'to' | 'From' | 'from' | 'refer-to' | 'referred-by' | 'p-asserted-identity' | 'remote-party-id'): SipMessage.AOR;
    /** Parse and return an arbitrary SIP header. */
    getParsedHeader(name: string): any;
    /** Parse and return an arbitrary SIP header. */
    getParsedHeader(hdr: string): any;
    /** Set or modify a SIP header on the response before sending it. */
    set(hdr: string | Record<string, string>, value?: string): this;
    /** The collection of SIP headers. */
    headers: Record<string, string>;
    /** The body of the response (e.g., SDP). */
    body: string;
    /** For multipart messages, an array of body payloads. */
    payload: SipMessage.Payload[];
    /** The SIP status code. */
    status: number;
    /** The SIP reason phrase. */
    reason: string;
    /** The raw, unparsed SIP message string. */
    readonly raw: string;
    /** The message type ('request' or 'response'). */
    readonly type: string;
}
declare class Response extends Emitter {
    _agent?: any;
    msg: SipMessage;
    finished: boolean;
    _req?: any;
    source?: string;
    source_address?: string;
    source_port?: number;
    protocol?: string;
    stackTime?: string;
    stackTxnId?: string;
    stackDialogId?: string;
    socket?: any;
    [key: string]: any;
    constructor(agent?: any);
    get req(): any;
    set req(req: any);
    get agent(): any;
    set agent(agent: any);
    set meta(meta: any);
    get meta(): any;
    set statusCode(code: number);
    get statusCode(): number;
    get finalResponseSent(): boolean;
    get headersSent(): boolean;
    /**
     * Sends the SIP response.
     *
     * @param status The SIP status code (e.g., 200).
     * @param reason Optional SIP reason phrase (e.g., 'OK'). If omitted, a standard reason phrase is used.
     * @param opts Optional object containing headers and body.
     * @param callback Optional callback.
     * @param fnPrack Optional callback for when a PRACK is received (for 100rel).
     */
    send(status: number, reason?: any, opts?: any, callback?: any, fnPrack?: any): void;
    sendAck(dialogId: string, opts?: any, callback?: any): void;
    sendPrack(dialogId: string, opts?: any, callback?: any): void;
    toJSON(): any;
    removeHeader(hdrName: string): void;
    getHeader(hdrName: string): string | undefined;
    setHeader(hdrName: string, hdrValue: any): SipMessage;
    end(data?: any, encoding?: any, callback?: any): void;
}
export = Response;
