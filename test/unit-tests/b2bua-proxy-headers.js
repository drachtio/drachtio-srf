require('assert');
require('mocha');
require('should');

const Srf = require('../../lib/srf');
const SipError = require('../../lib/sip_error');

/* Minimal A-leg INVITE: only the properties createB2BUA reads before it
   reaches createUAC. */
function buildReq() {
  return {
    method: 'INVITE',
    body: 'v=0',
    headers: {},
    callingNumber: '+15551111',
    callingName: 'caller',
    calledNumber: '+15552222',
    get: () => undefined,
    getHeaderName: (h) => h
  };
}

/* The B-leg failure response whose headers get copied back onto the A leg. */
function buildUacRes() {
  return {
    status: 486,
    reason: 'Busy Here',
    headers: {
      'X-Secret': 'do-not-forward',
      'X-Keep': 'fine-to-forward'
    },
    getHeaderName: (h) => h,
    get: function(h) { return this.headers[h]; }
  };
}

/* Drive createB2BUA far enough to fail on the B leg, and return the headers
   it puts on the A-leg response. */
async function headersSentToALeg(proxyResponseHeaders, proxyRequestHeaders) {
  const srf = new Srf();
  const req = buildReq();
  let sent;

  const res = {
    finalResponseSent: false,
    send: (status, reason, opts) => {
      sent = (opts && opts.headers) || {};
    }
  };

  const err = new SipError(486, 'Busy Here');
  err.res = buildUacRes();
  srf.createUAC = async() => {
    throw err;
  };

  await srf.createB2BUA(req, res, 'sip:b@example.com', {
    proxyResponseHeaders,
    proxyRequestHeaders
  }).catch(() => {});

  return sent;
}

describe('createB2BUA proxyResponseHeaders', function() {
  it('applies the strip list from proxyResponseHeaders, not proxyRequestHeaders', async function() {
    // "all, except X-Secret" on the response side. The strip list was being read
    // from proxyRequestHeaders, so X-Secret was forwarded to the A leg anyway.
    const headers = await headersSentToALeg(['all', '-X-Secret'], []);

    headers.should.not.have.property('X-Secret');
    headers.should.have.property('X-Keep', 'fine-to-forward');
  });

  it('does not let the request strip list remove response headers', async function() {
    // Nothing was excluded on the response side, so both headers must survive
    // even though the request side asks to strip one of them.
    const headers = await headersSentToALeg(['all'], ['all', '-X-Keep']);

    headers.should.have.property('X-Keep', 'fine-to-forward');
    headers.should.have.property('X-Secret', 'do-not-forward');
  });
});
