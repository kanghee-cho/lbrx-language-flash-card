var Responses = (function () {
  function json(payload) {
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  }

  function success(data) {
    return json({ ok: true, data: data });
  }

  function error(code, message) {
    return json({ ok: false, error: { code: code, message: message } });
  }

  function health() {
    return json({
      status: 'ok',
      time: new Date().toISOString()
    });
  }

  function mapError(error) {
    if (AppError.isAppError(error)) {
      return error;
    }
    var message = String((error && error.message) || error || '');
    if (/Service invoked too many times|Quota exceeded|too many times in a short time|Exceeded maximum execution time/i.test(message)) {
      return new AppError('rate_limited', 'Server is busy, please retry');
    }
    return new AppError('internal', 'Internal error');
  }

  return {
    json: json,
    success: success,
    error: error,
    health: health,
    mapError: mapError
  };
})();
