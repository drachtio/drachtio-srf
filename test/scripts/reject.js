const Srf = require('../..');
const srf = new Srf();
const config = require('config');

srf.connect(config.get('drachtio-sut')) ;

srf.invite((req, res) => {
  res.send(480);
});
