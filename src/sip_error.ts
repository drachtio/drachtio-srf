import assert from 'assert';

/**
 * Represents an error caused by a non-success SIP response.
 * Contains the SIP status code, optional reason phrase, and optionally the original SIP response object.
 */
class SipError extends Error {
  status: number;
  reason?: string;
  res?: any; // The original SIP response if applicable

  constructor(status: number, reason?: string) {
    super(reason || `Sip non-success response: ${status}`);

    assert.ok(typeof status === 'number', 'first argument to SipError must be number');
    assert.ok(typeof reason === 'string' || typeof reason === 'undefined',
      'second argument to SipError, if provided, must be a string');

    this.name = 'SipError';
    this.status = status;
    if (reason) this.reason = reason;
    this.message = 'Sip non-success response: ' + this.status;

    Error.captureStackTrace(this, SipError);
  }
}

export = SipError;
