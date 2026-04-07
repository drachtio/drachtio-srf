// @ts-nocheck
import { exec as exec } from 'child_process'; ;
import Benchmark from 'benchmark';
const suite = new Benchmark.Suite();
import Srf4519 from 'drachtio-srf';
const srf4519 = new Srf4519();
import SrfLatest from '../..';
const srfLatest = new SrfLatest();

const startEnv = async() => {
  return new Promise((resolve, reject) => {
    exec(`docker-compose -f ${__dirname}/../docker-compose-testbed.yaml up -d`, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

const connect = (srf) => {
  return new Promise((resolve, reject) => {
    srf.connect({
      "host": "127.0.0.1",
      "port": 9061,
      "secret": "cymru",
      "enablePing": true,
      "pingInterval": 5000
    });
    srf.on('connect', () => { resolve(); });
  });
}

const run = async () => {
  console.log('starting docker..')
  await startEnv();
  console.log('connecting to drachtio server..')
  await connect(srf4519);
  await connect(srfLatest);
  console.log('starting benchmark..')

  suite
  .add('drachtio-srf@4.5.19', {
    defer: true,
    fn: (deferred) => {
      srf4519.request('sip:sipp-uas-options', {method: 'OPTIONS'}, (err, req) => {
        if (err) return deferred.reject(err);
        req.on('response', (res) => {
          deferred.resolve();
        });
      });
    }
  })
  /*
  .add('drachtio-srf@latest', {
    defer: true,
    fn: (deferred) => {
      srfLatest.request('sip:sipp-uas-options', {method: 'OPTIONS'}, (err, req) => {
        if (err) return deferred.reject(err);
        req.on('response', (res) => {
          deferred.resolve();
        });
      });
    }
  })
  */
  .on('cycle', function (event) {
    console.log(String(event.target))
  })
  .on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'))
    process.exit(0);
  })
  .run({ async: true });
};

run();