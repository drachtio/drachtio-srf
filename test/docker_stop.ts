// @ts-nocheck
import test from 'tape'; ;
import { exec as exec } from 'child_process'; ;

test('stopping docker network..', (t) => {
  t.timeoutAfter(10000);
  exec(`docker-compose -f ${__dirname}/docker-compose-testbed.yaml down`, (err, stdout, stderr) => {
    //console.log(`stdout: ${stdout}`);
    //if (stderr.length) console.log(`stderr: ${stderr}`);
  });
  t.end() ;
});

