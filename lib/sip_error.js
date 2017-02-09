'use strict' ;

class SipError extends Error {
  constructor( status, reason ) {
    super() ;

    this.name = 'SipError' ;
    this.status = status ;
    this.reason = reason ;
    this.message = 'Sip non-success response: ' + status ;
  }
}

module.exports = exports = SipError ;
