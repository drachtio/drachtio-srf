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
declare interface Response {
    on<U extends keyof Response.ResponseEvents>(event: U, listener: Response.ResponseEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof Response.ResponseEvents>(event: U, listener: Response.ResponseEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof Response.ResponseEvents>(event: U, listener: Response.ResponseEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof Response.ResponseEvents>(event: U, ...args: Parameters<Response.ResponseEvents[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
    get(hdr: string): string | undefined;
    has(hdr: string): boolean;
    getHeaderName(hdr: string): string | undefined;
    getParsedHeader(name: 'contact' | 'Contact'): Array<SipMessage.AOR>;
    getParsedHeader(name: 'via' | 'Via'): Array<SipMessage.Via>;
    getParsedHeader(name: 'To' | 'to' | 'From' | 'from' | 'refer-to' | 'referred-by' | 'p-asserted-identity' | 'remote-party-id'): SipMessage.AOR;
    getParsedHeader(name: string): any;
    getParsedHeader(hdr: string): any;
    set(hdr: string | Record<string, string>, value?: string): this;
    headers: Record<string, string>;
    body: string;
    payload: any[];
    status: number;
    reason: string;
    readonly raw: string;
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
