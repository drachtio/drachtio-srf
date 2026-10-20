require('assert');
require('mocha');
const should = require('should');

const Response = require('../../lib/response');
const onSend = require('../../lib/on-send');

/* an agent that just records what it was asked to send */
function responseWithStubAgent() {
  const sent = [];
  const res = new Response({sendResponse: (res) => sent.push(res.msg)});
  return {res, sent};
}

describe('Response#send status codes', function() {
  it('sends non-standard response codes received from carriers', function() {
    [477, 601, 602, 605, 607, 608].forEach((status) => {
      const {res, sent} = responseWithStubAgent();
      res.send(status, 'Rejected');
      sent.length.should.equal(1);
      sent[0].status.should.equal(status);
      sent[0].reason.should.equal('Rejected');
      res.finished.should.be.true();
    });
  });

  it('supplies a reason phrase when none is given', function() {
    let {res, sent} = responseWithStubAgent();
    res.send(486);
    sent[0].reason.should.equal('Busy Here');

    ({res, sent} = responseWithStubAgent());
    res.send(608);
    sent[0].reason.should.equal('Unknown');
  });

  it('rejects values that are not sip response codes', function() {
    [undefined, '486', 99, 700, 486.5].forEach((status) => {
      const {res} = responseWithStubAgent();
      (() => res.send(status)).should.throw(/must be a valid sip response code/);
    });
  });
});

describe('onSend reason phrase', function() {
  function listenTo(res) {
    const heard = [];
    onSend(res, (status, reason) => heard.push({status, reason}));
    return heard;
  }

  it('matches the reason Response#send puts on the wire', function() {
    [[486], [608], [608, {headers: {}}]].forEach((args) => {
      const {res, sent} = responseWithStubAgent();
      const heard = listenTo(res);
      res.send(...args);
      heard[0].status.should.equal(args[0]);
      heard[0].reason.should.equal(sent[0].reason);
    });
  });
});
