// @ts-nocheck
import { exec } from 'child_process';
import './docker_start';
import './b2b';
import './reinvite-tests';
import './uac';
import './uas';
import './proxy';
import './utils';
import './refer';
import './docker_stop';

console.log('Run unit tests');

exec('"npm" run unittests', (err, stdout, stderr) => {
    console.log(stdout);
    console.log('Run integration tests');
});


