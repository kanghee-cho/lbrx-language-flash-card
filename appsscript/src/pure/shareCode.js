(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PureShareCode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var SHARE_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

  function generateFromBytes(bytes) {
    if (!bytes || bytes.length < 5) {
      throw new Error('Need at least 5 bytes to generate an 8-character share code');
    }

    var value = 0;
    var index;
    for (index = 0; index < 5; index += 1) {
      value = (value * 256) + (bytes[index] & 255);
    }

    var code = '';
    for (index = 0; index < 8; index += 1) {
      code = ALPHABET.charAt(value % 32) + code;
      value = Math.floor(value / 32);
    }
    return code;
  }

  function isValid(code) {
    return typeof code === 'string' && SHARE_CODE_RE.test(code);
  }

  return {
    ALPHABET: ALPHABET,
    SHARE_CODE_RE: SHARE_CODE_RE,
    generateFromBytes: generateFromBytes,
    isValid: isValid
  };
});
