declare class SipError extends Error {
    status: number;
    reason?: string;
    res?: any;
    constructor(status: number, reason?: string);
}
export = SipError;
