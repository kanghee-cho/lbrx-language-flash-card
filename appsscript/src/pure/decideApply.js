(function (root, factory) {
  var api = factory(root.PureHlc, root.PureAppError);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PureDecideApply = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PureHlc, PureAppError) {
  if (!PureHlc && typeof require === 'function') {
    PureHlc = require('./hlc');
  }
  if (!PureAppError && typeof require === 'function') {
    PureAppError = require('./AppError');
  }

  function decideApply(existingHlcOrNull, incomingHlc, existingOwnerId, callerId) {
    if (!PureHlc.isValidHlc(incomingHlc)) {
      throw new PureAppError('validation', 'Invalid HLC');
    }
    if (existingOwnerId && existingOwnerId !== callerId) {
      return { action: 'reject', reason: 'owner_mismatch' };
    }
    if (!existingHlcOrNull) {
      return { action: 'insert' };
    }
    if (!PureHlc.isValidHlc(existingHlcOrNull)) {
      throw new PureAppError('internal', 'Stored HLC is invalid');
    }
    return PureHlc.compare(incomingHlc, existingHlcOrNull) > 0
      ? { action: 'update' }
      : { action: 'ignore', reason: 'stale_hlc' };
  }

  return {
    decideApply: decideApply
  };
});
