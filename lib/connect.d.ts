import { EventEmitter } from 'events';
/**
 * Create a new drachtio-srf connection/app instance.
 * Serves as the factory function behind `drachtio()`.
 *
 * @returns An App instance (which is enhanced by Srf)
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
    client?: any;
    handle(req: any, res: any, next: any): void;
    use(...args: any[]): void;
    [key: string]: any;
}
declare function createServer(...args: any[]): App;
declare namespace createServer {
    var Agent: typeof import("./drachtio-agent");
    var Request: typeof import("./request").default;
    var Response: typeof import("./response");
    var onSend: typeof import("./on-send").default;
}
export = createServer;
