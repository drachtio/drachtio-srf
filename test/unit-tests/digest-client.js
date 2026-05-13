require('assert');
require('mocha');
require('should');

const DigestClient = require('../../lib/digest-client');

function buildRes({uri, proxy, statusCode = 401, sourceAddress = '1.1.1.1', sourcePort = 5060}) {
  const challengeHeader = statusCode === 407 ? 'proxy-authenticate' : 'www-authenticate';
  const captured = {};

  const options = {
    method: 'INVITE',
    uri,
    auth: {username: 'u', password: 'p'},
    headers: {}
  };
  if (proxy) options.proxy = proxy;

  const req = {
    method: 'INVITE',
    _originalParams: {options},
    get: (h) => {
      const lower = h.toLowerCase();
      if (lower === 'call-id') return 'call-id-1';
      if (lower === 'from') return '<sip:u@localhost>;tag=abc';
      return undefined;
    },
    getParsedHeader: (h) => {
      if (h === 'cseq') return {seq: 1, method: 'INVITE'};
    }
  };

  const agent = {
    request: (opts) => { captured.options = opts; }
  };

  const res = {
    statusCode,
    source_address: sourceAddress,
    source_port: sourcePort,
    socket: {},
    req,
    agent,
    has: (h) => h.toLowerCase() === challengeHeader,
    get: (h) => h.toLowerCase() === challengeHeader
      ? 'Digest realm="test",nonce="abc123",qop="auth"'
      : undefined
  };

  return {res, captured};
}

describe('DigestClient proxy pinning after challenge', function() {

  it('pins to challenger when no proxy is set and uri is a hostname', function() {
    const {res, captured} = buildRes({
      uri: 'sip:user@sbc.example.com',
      statusCode: 401,
      sourceAddress: '1.1.1.1',
      sourcePort: 5060
    });
    new DigestClient(res).authenticate(() => {});
    captured.options.proxy.should.eql('sip:1.1.1.1:5060');
  });

  it('does not pin when no proxy is set and uri is an IPv4 literal', function() {
    const {res, captured} = buildRes({
      uri: 'sip:1.2.3.4:5060',
      statusCode: 401
    });
    new DigestClient(res).authenticate(() => {});
    (captured.options.proxy === undefined).should.be.true();
  });

  it('does not pin when proxy is already an IPv4 literal (407)', function() {
    const {res, captured} = buildRes({
      uri: 'sip:user@sbc.example.com',
      proxy: 'sip:9.9.9.9:5080',
      statusCode: 407,
      sourceAddress: '1.1.1.1',
      sourcePort: 5060
    });
    new DigestClient(res).authenticate(() => {});
    captured.options.proxy.should.eql('sip:9.9.9.9:5080');
  });

  it('pins to challenger when proxy is a hostname (407)', function() {
    const {res, captured} = buildRes({
      uri: 'sip:user@host',
      proxy: 'sip:sbc.example.com',
      statusCode: 407,
      sourceAddress: '1.1.1.1',
      sourcePort: 5060
    });
    new DigestClient(res).authenticate(() => {});
    captured.options.proxy.should.eql('sip:1.1.1.1:5060');
  });

  it('pins and preserves transport taken from hostname proxy', function() {
    const {res, captured} = buildRes({
      uri: 'sip:user@host',
      proxy: 'sip:sbc.example.com;transport=udp',
      statusCode: 407,
      sourceAddress: '1.1.1.1',
      sourcePort: 5061
    });
    new DigestClient(res).authenticate(() => {});
    captured.options.proxy.should.eql('sip:1.1.1.1:5061;transport=udp');
  });

  it('pins and preserves transport taken from uri when no proxy is set', function() {
    const {res, captured} = buildRes({
      uri: 'sip:user@sbc.example.com;transport=udp',
      statusCode: 401,
      sourceAddress: '1.1.1.1',
      sourcePort: 5060
    });
    new DigestClient(res).authenticate(() => {});
    captured.options.proxy.should.eql('sip:1.1.1.1:5060;transport=udp');
  });

  it('pins when proxy is a hostname even if uri is an IPv4 literal', function() {
    // proxy is the actual next-hop; an IP literal in the uri does not
    // prevent the hostname proxy from re-resolving to a different A-record.
    const {res, captured} = buildRes({
      uri: 'sip:user@1.2.3.4',
      proxy: 'sip:sbc.example.com',
      statusCode: 407,
      sourceAddress: '1.1.1.1',
      sourcePort: 5060
    });
    new DigestClient(res).authenticate(() => {});
    captured.options.proxy.should.eql('sip:1.1.1.1:5060');
  });

});

describe('DigestClient malformed challenge handling', function() {

  function resWithChallenge(value) {
    const options = {
      method: 'INVITE',
      uri: 'sip:u@sbc.example.com',
      auth: {username: 'u', password: 'p'},
      headers: {}
    };
    const req = {
      method: 'INVITE',
      _originalParams: {options},
      get: () => undefined,
      getParsedHeader: () => ({seq: 1, method: 'INVITE'})
    };
    return {
      statusCode: 401,
      source_address: '1.1.1.1',
      source_port: 5060,
      socket: {},
      req,
      agent: {request: () => {}},
      has: (h) => h.toLowerCase() === 'www-authenticate',
      get: (h) => h.toLowerCase() === 'www-authenticate' ? value : undefined
    };
  }

  it('returns Error (does not throw) when www-authenticate value is undefined', function(done) {
    new DigestClient(resWithChallenge(undefined)).authenticate((err) => {
      err.should.be.an.Error();
      err.message.should.match(/empty or non-string/);
      done();
    });
  });

  it('returns Error when www-authenticate value is empty string', function(done) {
    new DigestClient(resWithChallenge('')).authenticate((err) => {
      err.should.be.an.Error();
      err.message.should.match(/empty or non-string/);
      done();
    });
  });

  it('_parseChallenge returns {} for undefined input', function() {
    const out = new DigestClient(resWithChallenge('Digest realm="x",nonce="y"'))
      ._parseChallenge(undefined);
    out.should.eql({});
  });

  it('_parseChallenge returns {} for non-Digest input', function() {
    const out = new DigestClient(resWithChallenge('Digest realm="x",nonce="y"'))
      ._parseChallenge('Basic realm="x"');
    out.should.eql({});
  });

  it('_parseChallenge captures digit-containing directive names (md5 algorithm)', function() {
    const out = new DigestClient(resWithChallenge('Digest realm="x",nonce="y"'))
      ._parseChallenge('Digest realm="x",nonce="y",algorithm=MD5');
    out.algorithm.should.eql('MD5');
  });

});
