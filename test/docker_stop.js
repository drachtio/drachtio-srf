const test = require('tape').test ;
const exec = require('child_process').exec ;

test('stopping docker network..', (t) => {
  t.timeoutAfter(10000);
  exec(`docker-compose -f ${__dirname}/docker-compose-testbed.yaml down`, (err, stdout, stderr) => {
    //console.log(`stdout: ${stdout}`);
    //if (stderr.length) console.log(`stderr: ${stderr}`);
  });
  t.end() ;
});

