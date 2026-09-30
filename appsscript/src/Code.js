function doGet() {
  return Responses.health();
}

function doPost(e) {
  var action = 'unknown';
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') {
      throw new AppError('validation', 'POST body must be a JSON string');
    }
    var request;
    try {
      request = JSON.parse(e.postData.contents);
    } catch (error) {
      throw new AppError('validation', 'POST body is not valid JSON');
    }
    Validation.ensureObject(request, 'request');
    action = Validation.ensureString(request.action, 'action');
    var payload = request.payload || {};

    switch (action) {
      case 'auth.ping':
        return Responses.success(Auth.ping(Auth.verifyIdToken(request.idToken)));
      case 'sync.pull':
        return Responses.success(SyncService.pull(Auth.verifyIdToken(request.idToken), payload));
      case 'sync.push':
        return Responses.success(SyncService.push(Auth.verifyIdToken(request.idToken), payload));
      case 'media.requestUpload':
        return Responses.success(MediaService.requestUpload(Auth.verifyIdToken(request.idToken), payload));
      case 'media.upload':
        return Responses.success(MediaService.upload(Auth.verifyIdToken(request.idToken), payload));
      case 'media.download':
        return Responses.success(MediaService.download(Auth.verifyIdToken(request.idToken), payload));
      case 'share.create':
        return Responses.success(ShareService.create(Auth.verifyIdToken(request.idToken), payload));
      case 'share.get':
        return Responses.success(ShareService.get(payload));
      case 'share.revoke':
        return Responses.success(ShareService.revoke(Auth.verifyIdToken(request.idToken), payload));
      case 'share.import':
        return Responses.success(ShareService.importShare(Auth.verifyIdToken(request.idToken), payload));
      default:
        throw new AppError('validation', 'Unknown action: ' + action);
    }
  } catch (error) {
    var mapped = Responses.mapError(error);
    console.error('Action ' + action + ' failed: ' + ((error && error.stack) || error));
    return Responses.error(mapped.code, mapped.message);
  }
}
