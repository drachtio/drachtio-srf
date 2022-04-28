const test = require('tape') ;
const exec = require('child_process').exec ;

test('testing parser functions', (t) => {
  const Srf = require('..');
  const {parseUri} = Srf;
  t.ok(typeof parseUri === 'function');
});