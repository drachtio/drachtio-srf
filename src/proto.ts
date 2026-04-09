import sipStatus from 'sip-status';
import debug from 'debug';
import Agent from './drachtio-agent';
import { EventEmitter } from 'events';
import delegate from 'delegates';

const log = debug('drachtio:agent');

const app: any = {};

app._init = function(this: any) {
  const client = new Agent(this);
  for (const prop in this.params) {
    client.set(prop, this.params[prop]);
  }
  for (const method in this.routedMethods) {
    client.route(method);
  }

  //propogate drachtio-client events to my listeners
  ['connect', 'close', 'error', 'reconnecting', 'listening'].forEach((event) => {
    client.on(event, (...args: any[]) => {
      EventEmitter.prototype.emit.apply(this, [event, ...args]);
    });
  });

  this._cachedEvents.forEach((event: string) => {
    client.on(event, (...args: any[]) => {
      EventEmitter.prototype.emit.apply(this, [event, ...args]);
    });
  });
  this._cachedEvents = [];

  //delegate some drachtio-client methods and accessors
  delegate(this, 'client')
    .method('request')
    .method('disconnect')
    .method('close')
    .method('get')
    .method('set')
    .getter('idle');

  return client;
};

app.connect = function(this: any, ...args: any[]) {
  const client = this.client = this._init();
  client.connect.apply(client, args);
  return this;
};

app.listen = function(this: any, ...args: any[]) {
  const client = this.client = this._init();
  const server = client.listen.apply(client, args);
  return server;
};

app.endSession = function(this: any, socketHolder: any) {
  if (this.client.isListening && socketHolder.socket) {
    this.client.disconnect(socketHolder.socket);
  }
};
app.request = function() {
  throw new Error('cannot call app#request in unconnected state');
};

app.set = function(this: any, prop: string, value: any) {
  this.params[prop] = value;
};

app.get = function(this: any, prop: string) {
  return this.params[prop];
};


/**
 * Applies the given middleware `handle` to the given `method`,
 * defaulting to '*', which means execute for all methods.
 *
 * @param method Optional method string (e.g. 'INVITE') or the middleware callback.
 * @param args The middleware callback(s).
 * @returns The app instance for chaining.
 * @api public
 */

app.use = function(this: any, fn: any, ...rest: any[]) {
  let offset = 0;
  let method = '*';

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
  const fns: any[] = [].concat(...[fn, ...rest].slice(offset));

  if (fns.length === 0) throw new TypeError('app.use() requires middleware functions');

  fns.forEach((fn: any) => {
    // wrap sub-apps
    if ('function' === typeof fn.handle) {
      const server = fn;
      fn.method = method;
      fn = function(req: any, res: any, next: any) {
        server.handle(req, res, next);
      };
    }

    log('use %s %s', method || '*', fn.name || 'anonymous');
    this.stack.push({ method: method, handle: fn });
  });

  if (typeof method === 'string' && method !== '*' && !(method in this.routedMethods)) {
    this.routedMethods[method] = true;
    if (this.client) { this.client.route(method); }
  }

  return this;
};

/**
 * Handle server requests, punting them down
 * the middleware stack.
 *
 * @api private
 */

app.handle = function(this: any, req: any, res: any, out: any) {
  const self = this;
  const stack = this.stack;
  let index = 0;

  log(`handling request with method ${req.method}`);
  req.app = this;

  function next(err?: any): void {
    let layer: any;

    // next callback
    layer = stack[index++];

    // all done
    if (!layer || res.finalResponseSent) {
      // delegate to parent
      if (out) { return out(err); }

      // unhandled error
      if (err) {
        // default to 500
        const finalResponseSent = res.finalResponseSent;

        console.error('some layer barfed an error: ', err);
        if (res.status < 400 || !req.status) { res.status = 500; }
        log(`default ${res.status}`);

        // respect err.status
        if (err.status) { res.status = err.status; }

        // production gets a basic error message
        const msg = sipStatus[res.status as keyof typeof sipStatus];

        // log to stderr in a non-test env
        console.error(err.stack || err.toString());
        if (finalResponseSent) { return; }
        res.send(res.status, msg);
      } else {
        if (req.method === 'PRACK') {
          res.send(200);
        }
        else if (req.method !== 'ACK' &&
          // Update is handled sepratedly in srf
          req.method !== 'UPDATE'
        ) {
          res.send(404);
          self.endSession(res);
        }
      }
      return;
    }

    try {

      // skip this layer if the route doesn't match.
      if (0 !== req.method.toLowerCase().indexOf(layer.method.toLowerCase()) &&
        layer.method !== '*') { return next(err); }

      log('%s %s : %s', layer.handle.name || 'anonymous', layer.method, req.uri);
      const arity = layer.handle.length;
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
    } catch(e: any) {
      console.error(e.stack);
      next(e);
    }
  }
  next();
};

export = app;
