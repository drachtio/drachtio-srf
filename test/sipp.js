const { spawn } = require('child_process');
//const debug = require('debug')('test:sipp');
let network;
const obj = {};
let output = '';
let idx = 1;

function clearOutput() {
  output = '';
}

function addOutput(str) {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) < 128) output += str.charAt(i);
  }
}

module.exports = (networkName) => {
  network = networkName ;
  return obj;
};

obj.output = () => {
  return output;
};

obj.sippUac = (file) => {
  const args = [
    'run', '--rm', '--net', `${network}`,
    '-v', `${__dirname}/scenarios:/tmp/scenarios`,
    'drachtio/sipp', 'sipp', '-sf', `/tmp/scenarios/${file}`,
    '-m', '1',
    '-sleep', '250ms',
    '-nostdin',
    '-cid_str', `%u-%p@%s-${idx++}`,
    'drachtio-sut'
  ];

  clearOutput();
  return runSipp(args);
};

// Run a sipp UAS as a named, DNS-resolvable container on the test network so
// the SUT can route a B-leg INVITE to `sip:<containerName>`. Resolves when the
// scenario completes (exit 0), e.g. uas.xml requires INVITE -> 200 -> ACK -> BYE,
// so a resolved promise proves the B leg was answered AND torn down.
obj.sippUas = (file, containerName) => {
  const cmd = 'docker';
  const args = [
    'run', '--rm', '--net', `${network}`, '--name', `${containerName}`,
    '-v', `${__dirname}/scenarios:/tmp/scenarios`,
    'drachtio/sipp', 'sipp', '-sf', `/tmp/scenarios/${file}`,
    '-m', '1',
    '-nostdin'
    // no target host: UAS listens for incoming calls
  ];

  return runSipp(args);
};

function runSipp(args) {
  return new Promise((resolve, reject) => {
    const child_process = spawn('docker', args, {stdio: ['inherit', 'pipe', 'pipe']});

    child_process.on('exit', (code, signal) => {
      if (code === 0) {
        return resolve();
      }
      console.log(`sipp exited with non-zero code ${code} signal ${signal}`);
      reject(code);
    });
    child_process.on('error', (error) => {
      console.log(`error spawing child process for docker: ${args}`);
    });

    child_process.stdout.on('data', (data) => {
      addOutput(data.toString());
    });
    child_process.stderr.on('data', (data) => {
      addOutput(data.toString());
    });
  });
}
