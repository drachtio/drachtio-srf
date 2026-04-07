// @ts-nocheck
import test from 'tape'; ;
import { exec as exec } from 'child_process'; ;

test('testing parser functions', (t) => {
  import Srf from '../src/srf';
  const {parseUri} = Srf;
  t.ok(typeof parseUri === 'function');
});