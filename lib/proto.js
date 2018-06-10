const sipStatus = require('sip-status') ;
const debug = require('debug')('connect:dispatcher');
const Agent = require('./drachtio-agent') ;
const EventEmitter = require('events').EventEmitter ;
const delegate = require('delegates') ;

const app = module.exports = {};

app._init = function() {
  const client = new Agent(this);
  for (const prop in this.params) {
    client.set(prop, this.params[prop]) ;
  }
  for (const method in this.routedMethods) {
    client.route(method) ;
  }

  //propogate drachtio-client events to my listeners
  ['connect', 'close', 'error', 'reconnecting', 'listening'].forEach((event) => {
    client.on(event, (...args) => {
      EventEmitter.prototype.emit.apply(this, [event].concat(args)) ;
    }) ;
  }) ;

  this._cachedEvents.forEach((event) => {
    app.on(event);
  }) ;
  this._cachedEvents = [] ;

  //delegate some drachtio-client methods and accessors
  delegate(this, 'client')
    .method('request')
    .method('disconnect')
    .method('close')
    .method('get')
    .method('set')
    .getter('idle') ;

  return client ;
};

app.connect = function(...args) {
  const client = this.client = this._init() ;
  client.connect.apply(client, args);
  return this ;
};

app.listen = function(...args) {
  const client = this.client = this._init() ;
  const server = client.listen.apply(client, args);
  return server ;
};

app.endSession = function(socketHolder) {
  if (this.client.isListening && socketHolder.socket) {
    this.client.disconnect(socketHolder.socket);
  }
};
app.request = function() {
  throw new Error('cannot call app#request in unconnected state') ;
} ;

app.set = function(prop, value) {
  this.params[prop] = value ;
};

app.get = function(prop) {
  return this.params[prop] ;
};


/**
 * Utilize the given middleware `handle` to the given `method`,
 * defaulting to _*_, which means execute for all methods.
 *
 * @param {String|Function} method or callback
 * @param {Function} callback
 * @return {Server} for chaining
 * @api public
 */

app.use = function(fn) {
  let offset = 0 ;
  let method = '*' ;

  // disambiguate app.use([fn])
  if (typeof fn !== 'function') {
    let arg = fn;

    while (Array.isArray(arg) && arg.length !== 0) {
      arg = arg[0];
    }

    // first arg is the method
    if (typeof arg !== 'function') {
      offset = 1;
      method = fn;
    }
  }

  // if an array was provided, flatten it
  const fns = [].concat(...Array.prototype.slice.call(arguments, offset));

  if (fns.length === 0) throw new TypeError('app.use() requires middleware functions');

  fns.forEach((fn) => {
    // wrap sub-apps
    if ('function' === typeof fn.handle) {
      var server = fn;
      fn.method = method;
      fn = function(req, res, next) {
        server.handle(req, res, next);
      };
    }

    debug('use %s %s', method || '*', fn.name || 'anonymous');
    this.stack.push({ method: method, handle: fn });
  }) ;

  if (typeof method === 'string' && method !== '*' && !(method in this.routedMethods)) {
    this.routedMethods[method] = true ;
    if (this.client) { this.client.route(method) ; }
  }

  return this;
};

/**
 * Handle server requests, punting them down
 * the middleware stack.
 *
 * @api private
 */

app.handle = function(req, res, out) {
  const self = this;
  const stack = this.stack ;
  let index = 0;

  debug(`handling request with method ${req.method}`);
  req.app = this ;

  function next(err) {
    var layer;

    // next callback
    layer = stack[index++];

    // all done
    if (!layer || res.finalResponseSent) {
      // delegate to parent
      if (out) { return out(err); }

      // unhandled error
      if (err) {
        // default to 500
        var finalResponseSent = res.finalResponseSent ;

        console.error('some layer barfed an error: ', err) ;
        if (res.status < 400 || !req.status) { res.status = 500; }
        debug(`default ${res.status}`);

        // respect err.status
        if (err.status) { res.status = err.status; }

        // production gets a basic error message
        var msg = sipStatus[res.status] ;

        // log to stderr in a non-test env
        console.error(err.stack || err.toString());
        if (finalResponseSent) { return ; }
        res.send(res.status, msg);
      } else {
        if (req.method === 'PRACK') {
          res.send(200);
        }
        else if (req.method !== 'ACK') {
          res.send(404) ;
          self.endSession(res);
        }
      }
      return;
    }

    try {

      // skip this layer if the route doesn't match.
      if (0 !== req.method.toLowerCase().indexOf(layer.method.toLowerCase()) &&
        layer.method !== '*') { return next(err); }

      debug('%s %s : %s', layer.handle.name || 'anonymous', layer.method, req.uri);
      var arity = layer.handle.length;
      if (err) {
        if (arity === 4) {
          layer.handle(err, req, res, next);
        } else {
          next(err);
        }
      } else if (arity < 4) {
        layer.handle(req, res, next);
      } else {
        next();
      }
    } catch (e) {
      console.error(e.stack) ;
      next(e);
    }
  }
  next();
};
