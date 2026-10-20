require('assert');
require('mocha');
const should = require('should');

const Response = require('../../lib/response');

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
