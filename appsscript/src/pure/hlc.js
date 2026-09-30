(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PureHlc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var HLC_RE = /^\d{15}-\d{5}-[a-z0-9]+$/;

  function padNumber(value, width) {
    var text = String(Math.max(0, value));
    while (text.length < width) {
      text = '0' + text;
    }
    return text;
  }

  function isValidHlc(value) {
    return typeof value === 'string' && HLC_RE.test(value);
  }

  function compare(left, right) {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  }

  function mint(nowMillis, counter, nodeId) {
    return padNumber(nowMillis, 15) + '-' + padNumber(counter, 5) + '-' + String(nodeId || 'server');
  }

  return {
    HLC_RE: HLC_RE,
    padNumber: padNumber,
    isValidHlc: isValidHlc,
    compare: compare,
    mint: mint
  };
});
