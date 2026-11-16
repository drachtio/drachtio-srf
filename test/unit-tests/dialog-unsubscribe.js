require('assert');
require('mocha');
require('should');

const Dialog = require('../../lib/dialog');

const LOCAL_CONTACT = '<sip:local@127.0.0.1>';

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
    ...header({contact: LOCAL_CONTACT}),
    getParsedHeader: (h) => 'to' === h ?
      {params: {tag: 'local-tag'}} : [{uri: 'sip:local@127.0.0.1'}]
  };
  return new Dialog({}, 'uas', {req, res, sent});
}

describe('Dialog in-dialog unsubscribe', function() {
  it('includes the local Contact in the 2xx to a SUBSCRIBE with Expires: 0', async function() {
    const dialog = buildDialog();
    const sent = [];
    let unsubscribed = 0;
    dialog.on('unsubscribe', () => unsubscribed++);

    dialog.handle({method: 'SUBSCRIBE', ...header({event: 'presence', expires: '0'})},
      {send: (...args) => sent.push(args)});

    await new Promise((resolve) => setImmediate(resolve));
    sent.length.should.equal(1);
    sent[0][0].should.equal(202);
    sent[0][1].headers.Contact.should.equal(LOCAL_CONTACT);
    unsubscribed.should.equal(1);
  });
});
