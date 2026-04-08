// @ts-nocheck
import { spawn  } from 'child_process';
import { join } from 'path';
import debugFn from 'debug';
const debug = debugFn('test:sipp');
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

export default (networkName) => {
  network = networkName ;
  return obj;
};

obj.output = () => {
  return output;
};

obj.sippUac = (file) => {
  const cmd = 'docker';
  const scenariosPath = join(__dirname, '..', '..', 'test', 'scenarios');
  const args = [
    'run', '--rm', '--net', `${network}`,
    '-v', `${scenariosPath}:/tmp/scenarios`,
    'drachtio/sipp', 'sipp', '-sf', `/tmp/scenarios/${file}`,
    '-m', '1',
    '-sleep', '250ms',
    '-nostdin',
    '-cid_str', `%u-%p@%s-${idx++}`,
    'drachtio-sut'
  ];

  clearOutput();

  return new Promise((resolve, reject) => {
    const child_process = spawn(cmd, args, {stdio: ['inherit', 'pipe', 'pipe']});

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
      //debug(`stdout: ${data}`);
      addOutput(data.toString());
    });
    child_process.stderr.on('data', (data) => {
      console.error(`sipp stderr: ${data.toString()}`);
    });
  });
};
