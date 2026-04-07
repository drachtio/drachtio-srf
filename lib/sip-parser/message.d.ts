import * as parser from './parser';
declare namespace SipMessage {
    interface AOR {
        name?: string;
        uri: string;
        params: Record<string, string | number | null>;
    }
    interface Via {
        version: string;
        protocol: string;
        host: string;
        port?: number;
        params: Record<string, string | number | null>;
    }
    interface ParsedUri {
        family: 'ipv4' | 'ipv6';
        scheme: string;
        user?: string;
        password?: string;
        host: string;
        port?: number;
        params: Record<string, string | null>;
        headers: Record<string, string>;
        number?: string;
        context?: string | null;
    }
}
declare class SipMessage {
    headers: Record<string, string>;
    raw?: string;
    method?: string;
    version?: string;
    status?: number;
    reason?: string;
    uri?: string;
    body?: string;
    payload?: {
        type: string | null;
        content: string;
    }[];
    constructor(msg?: string | Partial<SipMessage>);
    get type(): string;
    get calledNumber(): string;
    get callingNumber(): string;
    get callingName(): string;
    get canFormDialog(): boolean;
    getHeaderName(hdr: string): string | undefined;
    set(hdr: string | Record<string, string>, value?: string): this;
    get(hdr: string): string | undefined;
    has(hdr: string): boolean;
    getParsedHeader(name: 'contact' | 'Contact'): Array<SipMessage.AOR>;
    getParsedHeader(name: 'via' | 'Via'): Array<SipMessage.Via>;
    getParsedHeader(name: 'To' | 'to' | 'From' | 'from' | 'refer-to' | 'referred-by' | 'p-asserted-identity' | 'remote-party-id'): SipMessage.AOR;
    getParsedHeader(name: string): any;
    toString(): string;
    static parseUri: typeof parser.parseUri;
}
export = SipMessage;
