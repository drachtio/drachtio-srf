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
declare interface Request {
    on<U extends keyof Request.RequestEvents>(event: U, listener: Request.RequestEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof Request.RequestEvents>(event: U, listener: Request.RequestEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof Request.RequestEvents>(event: U, listener: Request.RequestEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof Request.RequestEvents>(event: U, ...args: Parameters<Request.RequestEvents[U]>): boolean;
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
    method: string;
    uri: string;
    headers: Record<string, string>;
    body: string;
    payload: any[];
    readonly type: string;
    readonly raw: string;
    readonly callingNumber: string;
    readonly callingName: string;
    readonly calledNumber: string;
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
    cancel(opts?: any, callback?: any): void;
    proxy(opts: any): Promise<any>;
    proxy(opts: any, callback: (err: Error | null, results: any) => void): this;
    logIn(user: any, options: any, done: any): void;
    logOut(): void;
    isAuthenticated(): boolean;
    isUnauthenticated(): boolean;
}
export default Request;
