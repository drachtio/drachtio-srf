const Srf = require('../..');
const srf = new Srf();
const config = require('config');
const debug = require('debug')('drachtio:test');
const assert = require('assert');

srf.connect(config.get('drachtio-uas'))

let count = 0;
let referTo;

srf.use('invite', async(req, res) => {
  const uas = await srf.createUAS(req, res, {
    localSdp: req.body
  });
  debug(`refer-uas: answered call call ${++count} - ${req.get('Call-ID')}`);

  uas.on('destroy', () => {
    debug(`refer-uas: got BYE ${req.get('Call-ID')}`);
  });

  if (1 === count) {
    const from = req.getParsedHeader('From');
    debug(`refer-uas: From header: ${JSON.stringify(from)}`);
    const replaces = encodeURIComponent(`Replaces=${req.get('Call-ID')};from-tag=${from.params.tag};to-tag=foobar`);
    referTo = `sip:foo@bar?${replaces}`;
    debug(`refer-uas: Refer-To: ${referTo}`);
  }
  else if (2 === count) {
    setTimeout(async() => {
      const sent = await uas.request({
        method: 'REFER',
        headers: {
          'Refer-To': referTo
        }
      });
      sent.on('response', (response) => {
        debug(`refer-uas: got response to REFER: ${response.status}`);
        uas.destroy();
      });
    }, 2000);
  }
});

module.exports = srf;
