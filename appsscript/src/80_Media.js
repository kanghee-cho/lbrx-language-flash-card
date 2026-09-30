var MediaService = (function () {
  function withLock(work) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      return work();
    } finally {
      lock.releaseLock();
    }
  }

  function chunkKey(userId, mediaId, index) {
    return ['mediaChunk', userId, mediaId, index].join(':');
  }

  function requestUpload(user, payload) {
    var request = Validation.validateMediaUploadRequest(payload);
    return withLock(function () {
      var mediaState = Store.loadSheet('Media');
      var metaState = Store.loadMetaState();
      var existing = mediaState.byId[request.id];
      if (existing && existing.userId !== user.sub) {
        throw new AppError('forbidden', 'Media is owned by another user');
      }
      if (existing) {
        if (existing.sha256 !== request.sha256 || existing.mime !== request.mime || Number(existing.size) !== Number(request.size)) {
          throw new AppError('validation', 'Existing media metadata does not match the request');
        }
        return {
          alreadyUploaded: !!existing.uploaded,
          driveFileId: existing.driveFileId || null
        };
      }

      var nowIso = new Date().toISOString();
      var row = {
        userId: user.sub,
        serverSeq: null,
        id: request.id,
        sha256: request.sha256,
        mime: request.mime,
        size: request.size,
        uploaded: false,
        driveFileId: null,
        hlc: PureHlc.mint(Date.now(), 0, 'server'),
        createdAt: nowIso,
        deletedAt: null
      };
      mediaState.rows.push(row);
      mediaState.byId[row.id] = row;
      row.serverSeq = Store.reserveServerSeqs(metaState, 1)[0];
      Store.writeSheet('Media', mediaState.rows);
      Store.writeSheet('Meta', metaState.rows);
      return {
        alreadyUploaded: false,
        driveFileId: null
      };
    });
  }

  function upload(user, payload) {
    var request = Validation.validateMediaUploadChunk(payload);
    return withLock(function () {
      var cache = CacheService.getScriptCache();
      var mediaState = Store.loadSheet('Media');
      var metaState = Store.loadMetaState();
      var row = mediaState.byId[request.id];
      if (!row) {
        throw new AppError('not_found', 'Media was not found');
      }
      if (row.userId !== user.sub) {
        throw new AppError('forbidden', 'Media is owned by another user');
      }
      if (String(row.sha256).toLowerCase() !== request.sha256) {
        throw new AppError('validation', 'Media hash does not match the placeholder row');
      }
      if (row.uploaded && row.driveFileId) {
        return { complete: true };
      }

      cache.put(chunkKey(user.sub, request.id, request.chunkIndex), request.base64Chunk, AppConstants.MEDIA_CACHE_TTL_SECONDS);
      if (request.chunkIndex !== request.totalChunks - 1) {
        return { complete: false };
      }

      var keys = [];
      var index;
      for (index = 0; index < request.totalChunks; index += 1) {
        keys.push(chunkKey(user.sub, request.id, index));
      }
      var chunkMap = cache.getAll(keys);
      var base64 = '';
      for (index = 0; index < keys.length; index += 1) {
        var chunk = chunkMap[keys[index]];
        if (!chunk) {
          throw new AppError('validation', 'Missing upload chunk ' + index);
        }
        base64 += chunk;
      }

      var bytes = Utilities.base64Decode(base64);
      if (bytes.length !== Number(row.size)) {
        throw new AppError('validation', 'Uploaded byte count does not match the declared size');
      }
      var sha256 = Store.bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)).toLowerCase();
      if (sha256 !== request.sha256 || sha256 !== String(row.sha256).toLowerCase()) {
        throw new AppError('validation', 'Uploaded bytes failed SHA-256 verification');
      }

      var folder = Store.getOrCreateMediaFolder(metaState);
      var blob = Utilities.newBlob(bytes, row.mime, row.id);
      if (row.driveFileId) {
        try {
          DriveApp.getFileById(row.driveFileId).setTrashed(true);
        } catch (error) {
          console.error('Unable to trash previous media file for ' + row.id + ': ' + error);
        }
      }
      var file = folder.createFile(blob);
      row.uploaded = true;
      row.driveFileId = file.getId();
      row.serverSeq = Store.reserveServerSeqs(metaState, 1)[0];
      Store.writeSheet('Media', mediaState.rows);
      Store.writeSheet('Meta', metaState.rows);
      cache.removeAll(keys);
      return { complete: true };
    });
  }

  function download(user, payload) {
    return withLock(function () {
      Validation.ensureObject(payload || {}, 'payload');
      var mediaId = Validation.ensureUuidish(payload.id, 'payload.id');
      var mediaState = Store.loadSheet('Media');
      var row = mediaState.byId[mediaId];
      if (!row) {
        throw new AppError('not_found', 'Media was not found');
      }
      if (row.userId !== user.sub) {
        throw new AppError('forbidden', 'Media is owned by another user');
      }
      if (!row.uploaded || !row.driveFileId) {
        throw new AppError('not_found', 'Media has not been uploaded yet');
      }
      if (Number(row.size) > PureMediaValidation.MAX_MEDIA_BYTES) {
        throw new AppError('validation', 'Media is too large to download through this endpoint');
      }
      var file = DriveApp.getFileById(row.driveFileId);
      return {
        base64: Utilities.base64Encode(file.getBlob().getBytes()),
        mime: row.mime
      };
    });
  }

  return {
    requestUpload: requestUpload,
    upload: upload,
    download: download
  };
})();
