const test = require('blue-tape');
const Srf = require('..');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

test('utils', (t) => {
  const uri = Srf.parseUri('sip:1234@10.101.10.1;transport=udp');
  t.ok(uri.params.transport === 'udp', 'exposes Srf.parseUri');
  const err = new Srf.SipError(404);
  t.ok(err instanceof Error && err.status === 404, 'exposes Srf.SipError');
  t.end();
});
