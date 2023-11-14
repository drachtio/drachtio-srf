require('assert');
require('mocha');
require('should');

const assert = require('assert');
const examples = require('sip-message-examples');
const SipMessage = require('../../lib/sip-parser/message');
const parser = require('../../lib/sip-parser/parser');
const parseUri = parser.parseUri;
const Srf = require('../..');
assert.ok(typeof parseUri === 'function');
assert.ok(typeof Srf.parseUri === 'function');
console.log(`typeof parseUri is ${typeof parseUri}`);
console.log(`typeof Srf.parseUri is ${typeof Srf.parseUri}`);

describe('Parser', function () {
  it('should provide headers as string values', function () {
    var msg = new SipMessage(examples('invite'));
    (typeof msg.get('from')).should.eql('string');
  });
  it('should optionally provide a parsed header', function () {
    var msg = new SipMessage(examples('invite'));
    var obj = msg.getParsedHeader('from');
    obj.should.be.type('object');
    obj.should.have.property('uri');
  });

  it('getting a header should return the same value provided to set', function () {
    var msg = new SipMessage();
    msg.set('From', '<sip:daveh@localhost>;tag=1234');
    msg.get('From').should.eql('<sip:daveh@localhost>;tag=1234');
  });
  it('setting a header should be case insensitive', function () {
    var msg = new SipMessage();
    msg.set('from', '<sip:daveh@localhost>;tag=1234');
    msg.get('From').should.eql('<sip:daveh@localhost>;tag=1234');
  });
  it('getting a header should be case insensitive', function () {
    var msg = new SipMessage();
    msg.set('From', '<sip:daveh@localhost>;tag=1234');
    msg.get('from').should.eql('<sip:daveh@localhost>;tag=1234');
  });
  it('getting a private header should be case insensitive', function () {
    var msg = new SipMessage();
    msg.set('P-Called-Party-ID', '"Dave" <sip:daveh@localhost>');
    msg.get('p-called-party-id').should.eql('"Dave" <sip:daveh@localhost>');
  });
  it('getting a custom header should be case insensitive', function () {
    var msg = new SipMessage();
    msg.set('X-Foo', 'bar');
    msg.get('x-foo').should.eql('bar');
  });
  it('should not parse a header when not available', function () {
    var msg = new SipMessage();
    should.throws(msg.getParsedHeader.bind(msg, 'contact'));
  });
  it('should parse multiple headers into an array', function () {
    var msg = new SipMessage(examples('invite'));
    var via = msg.getParsedHeader('via');
    via.should.be.an.array;
    via.should.have.length(2);
  });
  it('should coalesce multiple calls to set', function () {
    var msg = new SipMessage();
    msg.set('via', 'SIP/2.0/UDP 10.1.10.101;branch=z9hG4bKac619477600');
    msg.set('via', 'SIP/2.0/UDP 10.1.10.103;branch=z9hG4bKac619477603');
    var via = msg.getParsedHeader('via');
    via.should.be.an.array;
    via.should.have.length(2);
    parser.getStringifier('via')([via[1]]).should.eql('Via: SIP/2.0/UDP 10.1.10.103;branch=z9hG4bKac619477603\r\n');
  });
  it('should set multiple headers at once', function () {
    var msg = new SipMessage();
    msg.set({
      to: '<sip:5753606@10.1.10.1>',
      i: '619455480112200022407@10.1.10.101'
    });
    msg.get('call-id').should.eql('619455480112200022407@10.1.10.101');
    msg.get('to').should.eql('<sip:5753606@10.1.10.1>');
  })
  it('should parse an invite request', function () {

    var msg = new SipMessage(examples('invite'));
    (msg.getParsedHeader('from').uri === null).should.be.false;
    msg.type.should.eql('request');
    (msg.body === null).should.be.false;
    msg.canFormDialog.should.be.true;
  });
  it('should parse compact headers', function () {

    var msg = new SipMessage(examples('invite-compact'));
    msg.getParsedHeader('from').should.be.an.object;
    msg.getParsedHeader('to').should.be.an.object;
    msg.getParsedHeader('via').should.be.an.array;
  });
  it('should parse a response', function () {
    var msg = new SipMessage(examples('200ok'));
    msg.type.should.eql('response');
    (msg.body === null).should.be.false;
  });
  it('should parse called number', function () {
    var msg = new SipMessage(examples('invite'));
    msg.calledNumber.should.eql('5753606');
  });
  it('should parse calling number', function () {
    var msg = new SipMessage(examples('invite'));
    msg.callingNumber.should.eql('4083084809');
  });
  it('should parse ipv4 dot decimal sip uri', function () {
    var uri = parseUri('sip:104461@10.1.0.100:61219;rinstance=39ccb7d8db4387b1;transport=tcp');
    uri.family.should.eql('ipv4');
    uri.host.should.eql('10.1.0.100');
    uri.port.should.eql(61219);
  });
  it('should parse ipv4 hostname sip uri', function () {
    var uri = parseUri('sip:104461@foo.bar.com:61219;rinstance=39ccb7d8db4387b1;transport=tcp');
    uri.family.should.eql('ipv4');
    uri.host.should.eql('foo.bar.com');
    uri.port.should.eql(61219);
  });
  it('should parse ipv6 sip uri', function () {
    var uri = parseUri('sip:104461@[2601:182:cd00:d4c6:604b:16f1:3f5a:44f8]:61219;rinstance=39ccb7d8db4387b1;transport=tcp');
    uri.family.should.eql('ipv6');
    uri.host.should.eql('[2601:182:cd00:d4c6:604b:16f1:3f5a:44f8]');
    uri.port.should.eql(61219);
  });
  it('should parse a sip uri with a dash or underscore', function () {
    var uri = parseUri('sip:116751x0@cor10-san.sip.phone.com');
    uri.family.should.eql('ipv4');
    uri.host.should.eql('cor10-san.sip.phone.com');
    uri.user.should.eql('116751x0');
  });
  it('should parse a sips uri', function () {
    var uri = parseUri('sips:116751x0@cor10-san.sip.phone.com');
    uri.family.should.eql('ipv4');
    uri.host.should.eql('cor10-san.sip.phone.com');
    uri.user.should.eql('116751x0');
    uri.scheme.should.eql('sips');
  });
  it('should parse a sip uri with host part being simple label', function () {
    var uri = parseUri('sip:116751@feature-server');
    uri.family.should.eql('ipv4');
    uri.host.should.eql('feature-server');
    uri.user.should.eql('116751');
    uri.scheme.should.eql('sip');
  });
  it('should parse a multi-part header', function () {
    var msg = new SipMessage(examples('siprec'));
    msg.payload.length.should.eql(2);
  });
  it('should parse a multi-part header with whitespace before boundary', function () {
    var msg = new SipMessage(examples('siprec2'));
    msg.payload.length.should.eql(2);
  });
  it('should parse a multi-part header with quoted boundary', function () {
    var msg = new SipMessage(examples('siprec3'));
    msg.payload.length.should.eql(2);
  });
  it('should parse a sip uri with a dash or underscore', function () {
    var uri = parseUri('sip:service@test_sipp-uas_1.com');
    uri.family.should.eql('ipv4');
    uri.host.should.eql('test_sipp-uas_1.com');
  });
  it('should parse calling name', function () {
    var msg = new SipMessage();
    msg.set('From', '"Dave" <sip:daveh@localhost>;tag=1234');
    msg.get('From').should.eql('"Dave" <sip:daveh@localhost>;tag=1234');
    msg.callingName.should.eql('Dave');
  });
  it('should parse calling name', function () {
    var msg = new SipMessage();
    msg.set('From', '"Dave" <sip:daveh@localhost>;tag=1234');
    msg.get('From').should.eql('"Dave" <sip:daveh@localhost>;tag=1234');
    msg.callingName.should.eql('Dave');
  });
});

