import { EventEmitter } from 'events';
import proto from './proto';
import merge from 'utils-merge';
import methods from 'sip-methods';
import Agent from './drachtio-agent';
import Request from './request';
import Response from './response';
import onSend from './on-send';

/**
 * Create a new server.
 *
 * @return {Function}
 * @api public
 */

interface App extends EventEmitter {
  (req: any, res: any, next: any): void;
  method: string;
  stack: any[];
  params: any[];
  _cachedEvents: string[];
  routedMethods: Record<string, any>;
  locals: Record<string, any>;
  client?: any; // To be typed properly later
  handle(req: any, res: any, next: any): void;
  use(...args: any[]): void;
  [key: string]: any;
}

function createServer(...args: any[]): App {
  const app = function(req: any, res: any, next: any) {
    app.handle(req, res, next);
  } as App;

  app.method = '*';
  merge(app, proto);
  merge(app, EventEmitter.prototype);
  app.stack = [];
  app.params = [];
  app._cachedEvents = [];
  app.routedMethods = {};
  app.locals = Object.create(null);
  
  for (let i = 0; i < args.length; ++i) {
    app.use(args[i]);
  }

  //create methods app.invite, app.register, etc..
  methods.forEach((method: string) => {
    app[method.toLowerCase()] = app.use.bind(app, method.toLowerCase());
  });

  //special handling for cdr events
  app.on = function(event: string, listener: (...args: any[]) => void) {
    if (0 === event.indexOf('cdr:')) {
      if (app.client) {
        app.client.on(event, function(this: any, ...args: any[]) {
          EventEmitter.prototype.emit.apply(app, [event, ...args]);
        });
      }
      else {
        app._cachedEvents.push(event);
      }
    }
    //delegate all others to standard EventEmitter prototype
    return EventEmitter.prototype.addListener.call(app, event, listener) as unknown as App;
  };

  return app;
}

createServer.Agent = Agent;
createServer.Request = Request;
createServer.Response = Response;
createServer.onSend = onSend;

export = createServer;
