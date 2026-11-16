require('assert');
require('mocha');
require('should');

const Dialog = require('../../lib/dialog');

function header(values) {
  return {
    get: (h) => values[h.toLowerCase()],
    has: (h) => h.toLowerCase() in values
  };
}

/* A uas dialog built from stubs that provide just what the constructor reads. */
function buildDialog() {
  const req = {
    method: 'INVITE',
    body: 'v=0',
    ...header({contact: '<sip:remote@127.0.0.1>'}),
    getParsedHeader: (h) => 'from' === h ?
      {params: {tag: 'remote-tag'}} : [{uri: 'sip:remote@127.0.0.1'}]
  };
  const res = {
    agent: {},
    stackDialogId: 'dialog-1',
    ...header({'call-id': 'call-1'})
  };
  const sent = {
    body: 'v=0',
    ...header({contact: '<sip:local@127.0.0.1>'}),
    getParsedHeader: (h) => 'to' === h ?
      {params: {tag: 'local-tag'}} : [{uri: 'sip:local@127.0.0.1'}]
  };
  return new Dialog({}, 'uas', {req, res, sent});
}

function subscribe(expires) {
  return {method: 'SUBSCRIBE', ...header({event: 'presence', expires: String(expires)})};
}

function recordingRes() {
  const sent = [];
  return {sent, send: (...args) => sent.push(args)};
}

describe('Dialog in-dialog SUBSCRIBE', function() {
  it('delivers a SUBSCRIBE to a listener attached right after the dialog is resolved', async function() {
    const dialog = buildDialog();
    const res = recordingRes();
    let delivered = 0;

    // a SUBSCRIBE that arrives while the app's `then()` attaching the listener is still queued
    dialog.handle(subscribe(3600), res);
    await Promise.resolve();
    dialog.on('subscribe', () => delivered++);

    await new Promise((resolve) => setImmediate(resolve));
    delivered.should.equal(1);
    res.sent.should.be.empty();
  });

  it('still rejects with 489 when no listener is attached', async function() {
    const dialog = buildDialog();
    const res = recordingRes();

    dialog.handle(subscribe(3600), res);
    await new Promise((resolve) => setImmediate(resolve));
    res.sent.length.should.equal(1);
    res.sent[0][0].should.equal(489);
  });
});
