var util = require('util');

function SipError(status, reason) {  
  if (!(this instanceof SipError)) { return new SipError( status, reason ); }

  Error.call(this);
  this.name = 'SipError' ;
  this.status = status ;
  this.reason = reason ;
  this.message = 'Sip non-success response: ' + status ;
}

util.inherits(SipError, Error);

module.exports = exports = SipError ;
