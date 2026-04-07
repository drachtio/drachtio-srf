"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = onSend;
const sip_status_1 = require("sip-status");
/**
 * Execute a listener when a response is about to be sent.
 *
 * @param {Object} res
 * @return {Function} listener
 * @api public
 */
function onSend(res, listener) {
    if (!res) {
        throw new TypeError('argument res is required');
    }
    if (typeof listener !== 'function') {
        throw new TypeError('argument listener must be a function');
    }
    res.send = createSend(res.send, listener);
}
function createSend(prevSend, listener) {
    let fired = false;
    return function send(...args) {
        if (!fired) {
            fired = true;
            const normalizedArgs = normalizeSendArgs.apply(this, args);
            listener.apply(this, normalizedArgs);
        }
        prevSend.apply(this, args);
    };
}
function normalizeSendArgs(...args) {
    const normalizedArgs = [];
    for (let i = 0; i < args.length; i++) {
        if (typeof args[i] === 'function') {
            break;
        }
        if (typeof args[i] === 'number') {
            normalizedArgs.push(args[i]);
        }
        else if (typeof args[i] === 'string') {
            normalizedArgs.push(args[i]);
        }
        else if (typeof args[i] === 'object') {
            if (normalizedArgs.length === 0) {
                normalizedArgs.push(this.status);
                normalizedArgs.push(sip_status_1.STATUS_CODES[this.status]);
            }
            else if (normalizedArgs.length === 1) {
                normalizedArgs.push(sip_status_1.STATUS_CODES[this.status]);
            }
            normalizedArgs.push(args[i]);
        }
    }
    if (0 === normalizedArgs.length) {
        normalizedArgs.push(this.status);
    }
    if (1 === normalizedArgs.length) {
        normalizedArgs.push(sip_status_1.STATUS_CODES[normalizedArgs[0]]);
    }
    if (2 === normalizedArgs.length) {
        normalizedArgs.push({});
    }
    return normalizedArgs;
}
