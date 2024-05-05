const exec = require('child_process').exec;

console.log('Run unit tests');

exec('"npm" run unittests', (err, stdout, stderr) => {
    console.log(stdout);

    console.log('Run integration tests');

    require('./docker_start');
    require('./b2b');
    require('./reinvite-tests');
    require('./uac');
    require('./uas');
    require('./proxy');
    require('./utils');
    require('./refer');
    require('./docker_stop');
});


