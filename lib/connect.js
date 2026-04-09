"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const events_1 = require("events");
const proto_1 = __importDefault(require("./proto"));
const utils_merge_1 = __importDefault(require("utils-merge"));
const sip_methods_1 = __importDefault(require("sip-methods"));
const drachtio_agent_1 = __importDefault(require("./drachtio-agent"));
const request_1 = __importDefault(require("./request"));
const response_1 = __importDefault(require("./response"));
const on_send_1 = __importDefault(require("./on-send"));
function createServer(...args) {
    const app = function (req, res, next) {
        app.handle(req, res, next);
    };
    app.method = '*';
    (0, utils_merge_1.default)(app, proto_1.default);
    (0, utils_merge_1.default)(app, events_1.EventEmitter.prototype);
    app.stack = [];
    app.params = [];
    app._cachedEvents = [];
    app.routedMethods = {};
    app.locals = Object.create(null);
    for (let i = 0; i < args.length; ++i) {
        app.use(args[i]);
    }
    //create methods app.invite, app.register, etc..
    sip_methods_1.default.forEach((method) => {
        app[method.toLowerCase()] = app.use.bind(app, method.toLowerCase());
    });
    //special handling for cdr events
    app.on = function (event, listener) {
        if (0 === event.indexOf('cdr:')) {
            if (app.client) {
                app.client.on(event, function (...args) {
                    events_1.EventEmitter.prototype.emit.apply(app, [event, ...args]);
                });
            }
            else {
                app._cachedEvents.push(event);
            }
        }
        //delegate all others to standard EventEmitter prototype
        return events_1.EventEmitter.prototype.addListener.call(app, event, listener);
    };
    return app;
}
createServer.Agent = drachtio_agent_1.default;
createServer.Request = request_1.default;
createServer.Response = response_1.default;
createServer.onSend = on_send_1.default;
module.exports = createServer;
