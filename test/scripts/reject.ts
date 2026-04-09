// @ts-nocheck
import Srf from '../../src/srf';
const srf = new Srf();
import config from 'config';

srf.connect(config.get('drachtio-sut')) ;

srf.invite((req, res) => {
  res.send(480);
});
