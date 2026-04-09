// @ts-nocheck
import test from 'tape'; ;
import { exec as exec } from 'child_process'; ;
import { join } from 'path';

test('stopping docker network..', (t) => {
  t.timeoutAfter(10000);
  const yamlPath = join(__dirname, '..', '..', 'test', 'docker-compose-testbed.yaml');
  
  // Force cleanup any orphaned dynamic sipp containers before bringing down the network
  exec('docker ps -q --filter ancestor=drachtio/sipp | xargs -r docker rm -f', () => {
    exec(`docker-compose -f ${yamlPath} down`, (err, stdout, stderr) => {
      //console.log(`stdout: ${stdout}`);
      //if (stderr.length) console.log(`stderr: ${stderr}`);
      t.end(err) ;
    });
  });
});

