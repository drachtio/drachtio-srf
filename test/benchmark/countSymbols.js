const Benchmark = require('benchmark');
const suite = new Benchmark.Suite();
const examples = require('sip-message-examples');
const str = examples('invite');

function containsEmoji(str) {
  const regex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;
  return regex.test(str);
}

const run = async () => {

  suite
  .add('countSymbols', () => {
    return [...str].length;
  })
  .add('countSymbols after checking for emojis', () => {
    return containsEmoji(str) ? [...str].length : str.length;
  })
  .add('str.length', () => {
    return str.length;
  })
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