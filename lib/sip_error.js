const assert = require('assert');

/**
 * Class representing a SIP non-success response to a transaction
 * @extends {Error}
 */
class SipError extends Error {

  /**
   * Create a SipError object
   *
   * @constructor
   * @param  {number}  status SIP final status
   * @param  {string} [reason] reason for failure; if not provided
   * the standard reason associated with the provided SIP status is used
   */
  constructor(...args /*status, reason*/) {
    super(...args) ;

    assert.ok(typeof args[0] === 'number', 'first argument to SipError must be number');
    assert.ok(typeof args[1] === 'string' || typeof args[1] === 'undefined',
      'second argument to SipError, if provided, must be a string');

    this.name = 'SipError' ;
    this.status = args[0] ;
    if (args[1]) this.reason = args[1] ;
    this.message = 'Sip non-success response: ' + this.status ;

    Error.captureStackTrace(this, SipError);
  }
}

module.exports = exports = SipError ;
