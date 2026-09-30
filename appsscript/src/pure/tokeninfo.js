(function (root, factory) {
  var api = factory(root.PureAppError);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PureTokenInfo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PureAppError) {
  if (!PureAppError && typeof require === 'function') {
    PureAppError = require('./AppError');
  }

  var VALID_ISSUERS = {
    'accounts.google.com': true,
    'https://accounts.google.com': true
  };

  function truthyEmailVerified(value) {
    return value === true || value === 'true';
  }

  function validateTokenInfo(json, allowedAudiences, nowSeconds) {
    if (!json || typeof json !== 'object') {
      throw new PureAppError('unauthorized', 'Token verification failed');
    }
    if (!Array.isArray(allowedAudiences) || allowedAudiences.length === 0) {
      throw new PureAppError('internal', 'GOOGLE_CLIENT_IDS is not configured');
    }
    if (!json.sub || typeof json.sub !== 'string') {
      throw new PureAppError('unauthorized', 'Token subject is missing');
    }
    if (!json.aud || allowedAudiences.indexOf(String(json.aud)) === -1) {
      throw new PureAppError('unauthorized', 'Token audience is not allowed');
    }
    if (!json.iss || !VALID_ISSUERS[String(json.iss)]) {
      throw new PureAppError('unauthorized', 'Token issuer is not allowed');
    }
    var exp = Number(json.exp);
    if (!exp || exp <= nowSeconds) {
      throw new PureAppError('unauthorized', 'Token has expired');
    }
    if (!truthyEmailVerified(json.email_verified)) {
      throw new PureAppError('unauthorized', 'Email is not verified');
    }
    if (!json.email || typeof json.email !== 'string') {
      throw new PureAppError('unauthorized', 'Token email is missing');
    }

    return {
      sub: String(json.sub),
      email: String(json.email),
      emailVerified: true
    };
  }

  return {
    VALID_ISSUERS: VALID_ISSUERS,
    validateTokenInfo: validateTokenInfo
  };
});
