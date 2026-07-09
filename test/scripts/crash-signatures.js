// Single source of truth for the crash signature the 3pcc regression test
// watches for. Referenced by both the app-side helper (scripts/b2b.js) and
// the test assertion (b2b.js) so the two cannot drift out of sync.
//
// NOTE: this matches on the V8 TypeError wording. The underlying defect is
// "uac was the {ack,res} 3pcc object, not a Dialog", so if a future engine
// rewords the message this regex must be updated here (one place).
const UAC_DESTROY_CRASH = /uac\.destroy is not a function/;

const matchesUacDestroyCrash = (reason) => {
  const message = typeof reason === 'string' ? reason : reason && reason.message;
  return UAC_DESTROY_CRASH.test(message || '');
};

module.exports = { UAC_DESTROY_CRASH, matchesUacDestroyCrash };
