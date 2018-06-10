const EventEmitter = require('events').EventEmitter ;
const proto = require('./proto') ;
const merge = require('utils-merge');
const methods = require('sip-methods') ;

exports = module.exports = createServer;

/**
 * Create a new server.
 *
 * @return {Function}
 * @api public
 */

function createServer() {
  function app(req, res, next) {
    app.handle(req, res, next);
  }
  app.method = '*';
  merge(app, proto);
  merge(app, EventEmitter.prototype);
  app.stack = [];
  app.params = [];
  app._cachedEvents = [] ;
  app.routedMethods = {} ;
  app.locals = Object.create(null);
  for (var i = 0; i < arguments.length; ++i) {
    app.use(arguments[i]);
  }

  //create methods app.invite, app.register, etc..
  methods.forEach((method) => {
    app[method.toLowerCase()] = app.use.bind(app, method.toLowerCase()) ;
  }) ;

  //special handling for cdr events
  app.on = function(event, listener) {
    if (0 === event.indexOf('cdr:')) {
      if (app.client) {
        app.client.on(event, function() {
          var args = Array.prototype.slice.call(arguments) ;
          EventEmitter.prototype.emit.apply(app, [event].concat(args)) ;
        }) ;
      }
      else {
        this._cachedEvents.push(event) ;
      }
    }
    //delegate all others to standard EventEmitter prototype
    return EventEmitter.prototype.addListener.call(app, event, listener) ;
  } ;

  return app;
}

createServer.Agent = require('./drachtio-agent');
createServer.Request = require('./request') ;
createServer.Response = require('./response') ;
createServer.onSend = require('./on-send') ;
