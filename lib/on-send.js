const status_codes = require('sip-status') ;

/**
 * Execute a listener when a response is about to be sent.
 *
 * @param {Object} res
 * @return {Function} listener
 * @api public
 */

module.exports = function onSend(res, listener) {
  if (!res) {
    throw new TypeError('argument res is required') ;
  }

  if (typeof listener !== 'function') {
    throw new TypeError('argument listener must be a function') ;
  }

  res.send = createSend(res.send, listener) ;
} ;

function createSend(prevSend, listener) {
  var fired = false ;

  return function send() {
    if (!fired) {
      fired = true ;

      var args = normalizeSendArgs.apply(this, arguments) ;
      listener.apply(this, args) ;
    }
    prevSend.apply(this, arguments) ;
  } ;
}

function normalizeSendArgs() {
  var args = [] ;
  for (var i = 0; i < arguments.length; i++) {
    if (typeof arguments[i] === 'function') { break ; }
    if (typeof arguments[i] === 'number') { args.push(arguments[i]) ; }
    else if (typeof arguments[i] === 'string') { args.push(arguments[i]) ; }
    else if (typeof arguments[i] === 'object') {
      if (args.length === 0) {
        args.push(this.status) ;
        args.push(status_codes[this.status]) ;
      }
      else if (args.length === 1) {
        args.push(status_codes[this.status]) ;
      }
      args.push(arguments[i]) ;
    }
  }
  if (0 === args.length) { args.push(this.status); }
  if (1 === args.length) { args.push(status_codes[args[0]]) ; }
  if (2 === args.length) { args.push({}) ; }

  return args ;
}
