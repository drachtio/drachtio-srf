const test = require('tape');
const Srf = require('..');
const assert = require('assert');

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

test('utils', (t) => {
  const uri = Srf.parseUri('sip:1234@10.101.10.1;transport=udp');
  t.ok(uri.params.transport === 'udp', 'exposes Srf.parseUri');
  const telUri = Srf.parseUri('<tel:+1-201-555-0123;phone-context=drachtio.org;ext=1>');
  t.ok(telUri.number === '+1-201-555-0123', 'Srf.parseUri can parse tel uri');
  t.ok(telUri.context === 'drachtio.org', 'Srf.parseUri can parse tel uri');
  t.ok(telUri.params.ext === '1', 'Srf.parseUri can parse tel uri');
  const err = new Srf.SipError(404);
  t.ok(err instanceof Error && err.status === 404, 'exposes Srf.SipError');
  t.throws((() => new Srf('bad,tag')), assert.AssertionError, 'tags may not contain commas');
  t.throws((() => new Srf('bad tag')), assert.AssertionError, 'tags may not contain spaces');
  const tags = [];
  for (let i = 0; i < 20; i++) tags.push(i.toString());
  t.doesNotThrow((() => new Srf(tags)), '20 tags are supported');
  tags.push('a');
  t.throws((() => new Srf(tags)), '21 tags are not supported');
  tags.pop();
  tags.pop()
  tags.push('12345678901234567890123456789012');
  t.doesNotThrow((() => new Srf(tags)), 'tags of length 32 characters are supported');
  tags.pop();
  tags.push('123456789012345678901234567890123');  
  t.throws((() => new Srf(tags)), 'tags of length 33 characters are not supported');
  t.end();
});
