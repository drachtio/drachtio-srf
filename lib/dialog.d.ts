import { EventEmitter as Emitter } from 'events';
interface DialogState {
    emitter?: Emitter;
    state?: any;
}
import Request from './request';
import Response from './response';
import SipMessage from './sip-parser/message';
declare namespace Dialog {
    interface DialogEvents {
        'destroy': (msg: SipMessage | Request, reason?: string) => void;
        'modify': (req: Request, res: Response) => void;
        'refresh': (req: Request) => void;
        'info': (req: Request, res: Response) => void;
        'notify': (req: Request, res: Response) => void;
        'options': (req: Request, res: Response) => void;
        'update': (req: Request, res: Response) => void;
        'refer': (req: Request, res: Response) => void;
        'message': (req: Request, res: Response) => void;
        'ack': (req: Request) => void;
        'subscribe': (req: Request, res: Response) => void;
        'unsubscribe': (req: Request, event: string) => void;
        'hold': (req: Request) => void;
        'unhold': (req: Request) => void;
    }
    interface DialogRequestOptions {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        auth?: {
            username: string;
            password: string;
        } | ((req: Request, res: Response, callback: any) => void);
        noAck?: boolean;
    }
    type DialogRequestCallback = (err: Error | null, res?: Response | any, ack?: any) => void;
}
declare interface Dialog {
    on<U extends keyof Dialog.DialogEvents>(event: U, listener: Dialog.DialogEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof Dialog.DialogEvents>(event: U, listener: Dialog.DialogEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof Dialog.DialogEvents>(event: U, listener: Dialog.DialogEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof Dialog.DialogEvents>(event: U, ...args: Parameters<Dialog.DialogEvents[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
    invite(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    invite(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    register(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    register(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    bye(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    bye(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    cancel(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    cancel(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    ack(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    ack(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    info(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    info(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    notify(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    notify(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    options(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    options(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    prack(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    prack(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    publish(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    publish(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    refer(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    refer(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    subscribe(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    subscribe(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    update(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    update(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    message(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    message(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
}
declare class Dialog extends Emitter {
    srf: any;
    type: string;
    req: Request;
    res: Response;
    auth: any;
    agent: any;
    onHold: boolean;
    connected: boolean;
    queuedRequests: {
        req: Request;
        res: Response;
    }[];
    _queueRequests: boolean;
    _reinvitesInProgress: {
        count: number;
        admitOne: (() => void)[];
    };
    sip: {
        callId: string;
        remoteTag: string;
        localTag: string;
    };
    local: {
        uri: string;
        sdp: string;
        contact: string;
    };
    remote: {
        uri: string;
        sdp: string;
    };
    subscriptions: string[];
    _emitter?: Emitter;
    _state?: any;
    other?: Dialog;
    constructor(srf: any, type: string, opts: {
        req: Request;
        res: Response;
        auth?: any;
        sent?: any;
    });
    get id(): string;
    get dialogType(): string;
    get subscribeEvent(): string | null | undefined;
    get socket(): any;
    set stateEmitter(val: DialogState);
    set queueRequests(enqueue: boolean);
    toJSON(): any;
    toString(): any;
    getCountOfSubscriptions(): number;
    addSubscription(req: any): number;
    removeSubscription(uri: string, event: string): number;
    destroy(opts?: {
        headers?: Record<string, string>;
        auth?: Dialog.DialogRequestOptions['auth'];
    }): Promise<SipMessage | Request>;
    destroy(opts: {
        headers?: Record<string, string>;
        auth?: Dialog.DialogRequestOptions['auth'];
    } | undefined, callback: (err: Error | null, msg?: SipMessage | Request) => void): this;
    modify(sdp?: string | {
        headers?: Record<string, string>;
        auth?: Dialog.DialogRequestOptions['auth'];
        noAck?: boolean;
    }): Promise<string | {
        sdp: string;
        ack: (opts?: any) => void;
    }>;
    modify(sdp: string | {
        headers?: Record<string, string>;
        auth?: Dialog.DialogRequestOptions['auth'];
        noAck?: boolean;
    } | undefined, callback: (err: Error | null, sdp?: string, ack?: (opts?: any) => void) => void): this;
    modify(sdp: string, opts: {
        headers?: Record<string, string>;
        auth?: Dialog.DialogRequestOptions['auth'];
        noAck?: boolean;
    }): Promise<string | {
        sdp: string;
        ack: (opts?: any) => void;
    }>;
    modify(sdp: string, opts: {
        headers?: Record<string, string>;
        auth?: Dialog.DialogRequestOptions['auth'];
        noAck?: boolean;
    } | undefined, callback: (err: Error | null, sdp?: string, ack?: (opts?: any) => void) => void): this;
    request(opts: Dialog.DialogRequestOptions): Promise<Response>;
    request(opts: Dialog.DialogRequestOptions, callback: Dialog.DialogRequestCallback): this;
    handle(req: any, res: any): void;
}
export = Dialog;
