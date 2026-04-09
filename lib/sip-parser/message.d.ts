import * as parser from './parser';
/**
 * Namespace containing types related to SIP messages and parsed headers.
 */
declare namespace SipMessage {
    /** Represents an Address of Record (AOR) often found in To, From, Contact headers. */
    interface AOR {
        /** Optional display name (e.g., 'Alice'). */
        name?: string;
        /** The SIP URI (e.g., 'sip:alice@example.com'). */
        uri: string;
        /** Key-value parameters attached to the AOR (e.g., tag). */
        params: Record<string, string | number | null>;
    }
    /** Represents a Via header entry. */
    interface Via {
        /** The SIP version (usually '2.0'). */
        version: string;
        /** The transport protocol (e.g., 'UDP', 'TCP', 'TLS'). */
        protocol: string;
        /** The host or IP address. */
        host: string;
        /** The port number. */
        port?: number;
        /** Key-value parameters (e.g., branch). */
        params: Record<string, string | number | null>;
    }
    /** Represents a fully parsed SIP URI. */
    interface ParsedUri {
        /** IP family or 'ipv4'/'ipv6'. */
        family: 'ipv4' | 'ipv6';
        /** The URI scheme (e.g., 'sip', 'sips', 'tel'). */
        scheme: string;
        /** The user part of the URI. */
        user?: string;
        /** The password part of the URI. */
        password?: string;
        /** The host or domain. */
        host: string;
        /** The port. */
        port?: number;
        /** Key-value URI parameters. */
        params: Record<string, string | null>;
        /** Key-value URI headers. */
        headers: Record<string, string>;
        /** The number if it's a tel URI. */
        number?: string;
        /** The context if it's a tel URI. */
        context?: string | null;
    }
    interface Payload {
        /** The content type of this multipart payload element. */
        type: string | null;
        /** The raw content of this multipart payload element. */
        content: string;
    }
}
/**
 * Represents the fundamental SIP message structure (either request or response).
 * Underlying class for `Request` and `Response`.
 */
declare class SipMessage {
    headers: Record<string, string>;
    raw?: string;
    method?: string;
    version?: string;
    status?: number;
    reason?: string;
    uri?: string;
    body?: string;
    payload?: SipMessage.Payload[];
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
