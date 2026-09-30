(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PureAppError = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function AppError(code, message) {
    this.name = 'AppError';
    this.code = code || 'internal';
    this.message = message || 'Unexpected error';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    } else {
      this.stack = new Error(this.message).stack;
    }
  }

  AppError.prototype = Object.create(Error.prototype);
  AppError.prototype.constructor = AppError;

  AppError.isAppError = function (error) {
    return !!(error && typeof error.code === 'string' && typeof error.message === 'string');
  };

  AppError.wrap = function (error, fallbackCode, fallbackMessage) {
    if (AppError.isAppError(error)) {
      return error;
    }
    return new AppError(fallbackCode || 'internal', fallbackMessage || 'Unexpected error');
  };

  return AppError;
});
