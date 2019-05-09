const Srf = require('../..');
const srf = new Srf();
const config = require('config');
const debug = require('debug')('drachtio:test');
const assert = require('assert');
const parseUri = Srf.parseUri;

srf.connect(config.get('drachtio-sut'))

srf.use('invite', async(req, res) => {
  debug(`refer-b2b: received call: ${req.get('Call-ID')}`);
  const {uas, uac} = await srf.createB2BUA(req, res, '172.29.0.19');
  debug(`refer-b2b: call connected: ${req.get('Call-ID')}`);

  uac.on('destroy', () => {
    debug(`BYE from ${req.get('Call-ID')}`);
  });

  uac.on('refer', async(req, res) => {
    debug(`refer-b2b: received REFER: ${req.get('Call-ID')}`);
    res.send(202);

    // find the other dialog.
    const referTo = decodeURIComponent(req.get('Refer-To'));
    const arr = /\?Replaces=(.*);from-tag=(.*);to-tag=(.*)/.exec(referTo);
    assert(arr);
    const callId = arr[1];
    const fromTag = arr[2];
    debug(`regexp: ${arr}, callid: ${callId}, tag: ${fromTag}`);
    const transferee = srf.findDialogByCallIDAndFromTag(callId, fromTag);
    assert(transferee);
    const other = transferee.other;
    assert(other);

    // reinvite both to each other
    await other.modify(uas.remote.sdp);
    await uas.modify(other.remote.sdp);
    debug('successfully reinvited both dialogs');
    uas.destroy();
    other.destroy();
  });
});

module.exports = srf;
