// @ts-nocheck
import test from 'tape'; ;
import { exec as exec } from 'child_process'; ;

test('starting docker network..', (t) => {
  t.plan(1);
  exec(`docker-compose -f ${__dirname}/docker-compose-testbed.yaml up -d`, (err, stdout, stderr) => {
    t.pass('docker is up');
    t.end(err);
  });
});