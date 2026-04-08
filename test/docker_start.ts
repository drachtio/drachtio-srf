// @ts-nocheck
import test from 'tape'; ;
import { exec as exec } from 'child_process'; ;
import { join } from 'path';

test('starting docker network..', (t) => {
  t.plan(1);
  const yamlPath = join(__dirname, '..', '..', 'test', 'docker-compose-testbed.yaml');
  exec(`docker-compose -f ${yamlPath} up -d`, (err, stdout, stderr) => {
    console.log(stdout);
    if (stderr) console.error(stderr);
    if (err) {
      console.error('Error starting docker:', err);
      t.fail('docker failed to start');
      return t.end(err);
    }
    t.pass('docker is up');
    setTimeout(() => {
      t.end(err);
    }, 5000); // give drachtio time to bind ports
  });
});