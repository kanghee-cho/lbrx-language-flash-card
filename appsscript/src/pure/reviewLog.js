(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PureReviewLog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function decideInsert(existingExists) {
    return existingExists
      ? { action: 'ignore', reason: 'duplicate_id' }
      : { action: 'insert' };
  }

  return {
    decideInsert: decideInsert
  };
});
