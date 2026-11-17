require('assert');
require('mocha');
require('should');

const Dialog = require('../../lib/dialog');

const SUBSCRIBER = 'sip:alice@127.0.0.1';

function header(values) {
  return {
    get: (h) => values[h.toLowerCase()],
    has: (h) => h.toLowerCase() in values
  };
}

/* A uac SUBSCRIBE dialog built from stubs that provide just what the constructor reads. */
function buildSubscribeDialog() {
  const req = {
    method: 'SUBSCRIBE',
    uri: 'sip:notifier@127.0.0.1',
    ...header({contact: '<sip:local@127.0.0.1>', event: 'presence'}),
    getParsedHeader: (h) => 'from' === h ? {params: {tag: 'local-tag'}} : {uri: SUBSCRIBER}
  };
  const res = {
    agent: {},
    stackDialogId: 'dialog-1',
    ...header({'call-id': 'call-1'}),
    getParsedHeader: (h) => 'to' === h ?
      {params: {tag: 'remote-tag'}} : [{uri: 'sip:notifier@127.0.0.1'}]
  };
  const srf = {removeDialog: () => {}};
  return new Dialog(srf, 'uac', {req, res});
}

function notify(state) {
  return {
    method: 'NOTIFY',
    ...header({event: 'presence', 'subscription-state': state}),
    getParsedHeader: () => ({uri: SUBSCRIBER})
  };
}

function recordingRes() {
  const sent = [];
  return {sent, send: (...args) => sent.push(args)};
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

describe('Dialog in-dialog NOTIFY', function() {
  it('delivers a NOTIFY to a listener attached right after the dialog is resolved', async function() {
    const dialog = buildSubscribeDialog();
    const res = recordingRes();
    let delivered = 0;

    // a NOTIFY that arrives while the app's `then()` attaching the listener is still queued
    dialog.handle(notify('active;expires=3600'), res);
    await Promise.resolve();
    dialog.on('notify', () => delivered++);

    await nextTurn();
    delivered.should.equal(1);
    res.sent.should.be.empty();
  });

  it('still answers 200 when no listener is attached', async function() {
    const dialog = buildSubscribeDialog();
    const res = recordingRes();

    dialog.handle(notify('active;expires=3600'), res);
    await nextTurn();
    res.sent.length.should.equal(1);
    res.sent[0][0].should.equal(200);
  });

  it('delivers a terminating NOTIFY before the dialog is destroyed', async function() {
    const dialog = buildSubscribeDialog();
    const order = [];

    dialog.handle(notify('terminated;reason=timeout'), recordingRes());
    await Promise.resolve();
    dialog.on('notify', () => order.push('notify'));
    dialog.on('destroy', () => order.push('destroy'));

    await nextTurn();
    await nextTurn();
    order.should.eql(['notify', 'destroy']);
    dialog.connected.should.be.false();
  });
});
