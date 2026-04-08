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
        /** Emitted when the dialog is destroyed (e.g., BYE received/sent). */
        'destroy': (msg: SipMessage | Request, reason?: string) => void;
        /** Emitted when the dialog is modified (e.g., re-INVITE with new SDP). */
        'modify': (req: Request, res: Response) => void;
        /** Emitted when the dialog is refreshed (e.g., re-INVITE with same SDP). */
        'refresh': (req: Request) => void;
        /** Emitted when an INFO request is received within the dialog. */
        'info': (req: Request, res: Response) => void;
        /** Emitted when a NOTIFY request is received within the dialog. */
        'notify': (req: Request, res: Response) => void;
        /** Emitted when an OPTIONS request is received within the dialog. */
        'options': (req: Request, res: Response) => void;
        /** Emitted when an UPDATE request is received within the dialog. */
        'update': (req: Request, res: Response) => void;
        /** Emitted when a REFER request is received within the dialog. */
        'refer': (req: Request, res: Response) => void;
        /** Emitted when a MESSAGE request is received within the dialog. */
        'message': (req: Request, res: Response) => void;
        /** Emitted when an ACK is received for a request sent within the dialog. */
        'ack': (req: Request) => void;
        /** Emitted when a SUBSCRIBE request is received within the dialog. */
        'subscribe': (req: Request, res: Response) => void;
        /** Emitted when an un-SUBSCRIBE (Expires: 0) is received. */
        'unsubscribe': (req: Request, event: string) => void;
        /** Emitted when a hold request (e.g., SDP a=sendonly or c=0.0.0.0) is received. */
        'hold': (req: Request) => void;
        /** Emitted when an unhold request is received. */
        'unhold': (req: Request) => void;
    }
    /**
     * Options for sending an in-dialog request.
     */
    interface DialogRequestOptions {
        /** The SIP method to send (e.g., 'INFO', 'UPDATE'). */
        method?: string;
        /** SIP Headers to include in the request. */
        headers?: Record<string, string>;
        /** The body of the request (e.g., SDP, plain text, JSON). */
        body?: string;
        /** Authentication credentials. */
        auth?: {
            username: string;
            password: string;
        } | ((req: Request, res: Response, callback: any) => void);
        /** If true, suppress automatically sending an ACK. */
        noAck?: boolean;
    }
    type DialogRequestCallback = (err: Error | null, res?: Response | any, ack?: any) => void;
}
/**
 * Represents a SIP Dialog.
 * Dialogs are created via Srf.createUAS, Srf.createUAC, or Srf.createB2BUA.
 * They emit events for in-dialog requests and allow sending requests within the dialog.
 *
 * @example
 * ```typescript
 * dialog.on('destroy', () => console.log('Dialog ended'));
 * dialog.on('info', (req, res) => {
 *   res.send(200);
 * });
 *
 * await dialog.request({ method: 'INFO', body: '...' });
 * ```
 */
declare interface Dialog {
    on<U extends keyof Dialog.DialogEvents>(event: U, listener: Dialog.DialogEvents[U]): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    once<U extends keyof Dialog.DialogEvents>(event: U, listener: Dialog.DialogEvents[U]): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;
    off<U extends keyof Dialog.DialogEvents>(event: U, listener: Dialog.DialogEvents[U]): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
    emit<U extends keyof Dialog.DialogEvents>(event: U, ...args: Parameters<Dialog.DialogEvents[U]>): boolean;
    emit(event: string | symbol, ...args: any[]): boolean;
    /** Send an in-dialog INVITE request */
    invite(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    invite(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog REGISTER request */
    register(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    register(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog BYE request (terminates the dialog) */
    bye(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    bye(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog CANCEL request */
    cancel(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    cancel(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog ACK request */
    ack(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    ack(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog INFO request */
    info(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    info(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog NOTIFY request */
    notify(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    notify(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog OPTIONS request */
    options(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    options(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog PRACK request */
    prack(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    prack(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog PUBLISH request */
    publish(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    publish(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog REFER request */
    refer(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    refer(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog SUBSCRIBE request */
    subscribe(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    subscribe(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog UPDATE request */
    update(opts?: Dialog.DialogRequestOptions): Promise<Response>;
    update(opts: Dialog.DialogRequestOptions | undefined, callback: Dialog.DialogRequestCallback): this;
    /** Send an in-dialog MESSAGE request */
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
    /**
     * Destroys the dialog by sending a BYE (if an INVITE dialog) or a terminating NOTIFY (if a SUBSCRIBE dialog).
     *
     * @param opts Options including custom headers to send with the terminating request.
     * @returns A promise resolving to the sent SipMessage or Request.
     */
    destroy(opts?: {
        headers?: Record<string, string>;
        auth?: Dialog.DialogRequestOptions['auth'];
    }): Promise<SipMessage | Request>;
    destroy(opts: {
        headers?: Record<string, string>;
        auth?: Dialog.DialogRequestOptions['auth'];
    } | undefined, callback: (err: Error | null, msg?: SipMessage | Request) => void): this;
    /**
     * Modifies the dialog by sending a re-INVITE.
     *
     * @param sdp Optional new SDP to send.
     * @param opts Additional options for the request.
     * @returns A promise resolving to the new SDP (or an object with SDP and ACK function if noAck was true).
     */
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
    /**
     * Sends an arbitrary SIP request within the context of the dialog.
     *
     * @param opts Options specifying the method, body, and headers.
     * @returns A promise resolving to the SIP Response.
     *
     * @example
     * ```typescript
     * try {
     *   const response = await dialog.request({
     *     method: 'INFO',
     *     headers: { 'Content-Type': 'application/dtmf-relay' },
     *     body: 'Signal=1\r\nDuration=100'
     *   });
     *   console.log('INFO accepted:', response.status);
     * } catch (err) {
     *   console.error('Failed to send INFO', err);
     * }
     * ```
     */
    request(opts: Dialog.DialogRequestOptions): Promise<Response>;
    request(opts: Dialog.DialogRequestOptions, callback: Dialog.DialogRequestCallback): this;
    handle(req: any, res: any): void;
}
export = Dialog;
