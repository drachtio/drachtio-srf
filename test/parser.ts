// @ts-nocheck
import test from 'tape'; ;
import { exec as exec } from 'child_process'; ;
import Srf from '../src/srf';

test('testing parser functions', (t) => {
  const {parseUri} = Srf;
  t.ok(typeof parseUri === 'function');
});