"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const assert_1 = __importDefault(require("assert"));
class SipError extends Error {
    status;
    reason;
    res; // The original SIP response if applicable
    constructor(status, reason) {
        super(reason || `Sip non-success response: ${status}`);
        assert_1.default.ok(typeof status === 'number', 'first argument to SipError must be number');
        assert_1.default.ok(typeof reason === 'string' || typeof reason === 'undefined', 'second argument to SipError, if provided, must be a string');
        this.name = 'SipError';
        this.status = status;
        if (reason)
            this.reason = reason;
        this.message = 'Sip non-success response: ' + this.status;
        Error.captureStackTrace(this, SipError);
    }
}
module.exports = SipError;
