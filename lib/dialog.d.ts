import { EventEmitter as Emitter } from 'events';
interface DialogState {
    emitter?: Emitter;
    state?: any;
}
import Request from './request';
import Response from './response';
import SipMessage from './sip-parser/message';
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
declare interface Dialog {
    on<U extends keyof DialogEvents>(event: U, listener: DialogEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof DialogEvents>(event: U, listener: DialogEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof DialogEvents>(event: U, listener: DialogEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof DialogEvents>(event: U, ...args: Parameters<DialogEvents[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
}
declare class Dialog extends Emitter {
    srf: any;
    type: string;
    req: any;
    res: any;
    auth: any;
    agent: any;
    onHold: boolean;
    connected: boolean;
    queuedRequests: any[];
    _queueRequests: boolean;
    _reinvitesInProgress: any;
    sip: any;
    local: any;
    remote: any;
    subscriptions: any[];
    _emitter: any;
    _state: any;
    other?: Dialog;
    constructor(srf: any, type: string, opts: any);
    get id(): string;
    get dialogType(): string;
    get subscribeEvent(): string | null;
    get socket(): any;
    set stateEmitter(val: DialogState);
    set queueRequests(enqueue: boolean);
    toJSON(): any;
    toString(): any;
    getCountOfSubscriptions(): number;
    addSubscription(req: any): number;
    removeSubscription(uri: string, event: string): number;
    destroy(opts?: any, callback?: any): any;
    modify(sdp?: any, opts?: any, callback?: any): any;
    request(opts: any, callback?: any): any;
    handle(req: any, res: any): void;
}
export = Dialog;
