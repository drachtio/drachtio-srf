/**
 * Represents an error caused by a non-success SIP response.
 * Contains the SIP status code, optional reason phrase, and optionally the original SIP response object.
 */
declare class SipError extends Error {
    status: number;
    reason?: string;
    res?: any;
    constructor(status: number, reason?: string);
}
export = SipError;
