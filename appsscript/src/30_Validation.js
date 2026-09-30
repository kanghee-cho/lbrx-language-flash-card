var AppError = PureAppError;

var Validation = (function () {
  var UUIDISH_RE = /^[A-Za-z0-9-]{6,128}$/;
  var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

  function fail(message) {
    throw new AppError('validation', message);
  }

  function ensureObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail(label + ' must be an object');
    }
    return value;
  }

  function ensureString(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
      fail(label + ' must be a non-empty string');
    }
    return value;
  }

  function optionalNullableString(value, label) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return ensureString(value, label);
  }

  function ensureUuidish(value, label) {
    ensureString(value, label);
    if (!UUIDISH_RE.test(value)) {
      fail(label + ' must look like an identifier');
    }
    return value;
  }

  function ensureShareCode(value) {
    ensureString(value, 'code');
    if (!PureShareCode.isValid(value)) {
      fail('code must be an 8-character Crockford base32 string');
    }
    return value;
  }

  function ensureIsoString(value, label) {
    ensureString(value, label);
    if (!ISO_RE.test(value) || isNaN(Date.parse(value))) {
      fail(label + ' must be an ISO-8601 string');
    }
    return value;
  }

  function ensureNullableIsoString(value, label) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    return ensureIsoString(value, label);
  }

  function ensureHlc(value) {
    ensureString(value, 'hlc');
    if (!PureHlc.isValidHlc(value)) {
      fail('hlc must match the documented HLC format');
    }
    return value;
  }

  function ensureTags(value, label) {
    if (!Array.isArray(value) || !value.every(function (item) { return typeof item === 'string'; })) {
      fail(label + ' must be an array of strings');
    }
    return value.slice();
  }

  function ensureLang(value, label) {
    return ensureString(value, label);
  }

  function ensureInteger(value, label) {
    var numeric = Number(value);
    if (!isFinite(numeric) || Math.floor(numeric) !== numeric) {
      fail(label + ' must be an integer');
    }
    return numeric;
  }

  function ensureNonNegativeInteger(value, label) {
    var numeric = ensureInteger(value, label);
    if (numeric < 0) {
      fail(label + ' must be >= 0');
    }
    return numeric;
  }

  function ensureRating(value) {
    var rating = ensureInteger(value, 'rating');
    if (rating < 1 || rating > 4) {
      fail('rating must be between 1 and 4');
    }
    return rating;
  }

  function ensureTestType(value) {
    var allowed = { flip: true, typing: true, choice: true };
    ensureString(value, 'testType');
    if (!allowed[value]) {
      fail('testType must be flip, typing, or choice');
    }
    return value;
  }

  function ensurePullLimit(value) {
    if (value === undefined || value === null || value === '') {
      return AppConstants.DEFAULT_PULL_LIMIT;
    }
    var limit = ensureInteger(value, 'limit');
    if (limit <= 0 || limit > AppConstants.MAX_PULL_LIMIT) {
      fail('limit must be between 1 and ' + AppConstants.MAX_PULL_LIMIT);
    }
    return limit;
  }

  function validateDeckRecord(record) {
    ensureObject(record, 'deck');
    return {
      id: ensureUuidish(record.id, 'deck.id'),
      name: ensureString(record.name, 'deck.name'),
      description: optionalNullableString(record.description, 'deck.description'),
      sourceLang: ensureLang(record.sourceLang, 'deck.sourceLang'),
      targetLang: ensureLang(record.targetLang, 'deck.targetLang'),
      tags: ensureTags(record.tags, 'deck.tags'),
      hlc: ensureHlc(record.hlc),
      createdAt: ensureIsoString(record.createdAt, 'deck.createdAt'),
      deletedAt: ensureNullableIsoString(record.deletedAt, 'deck.deletedAt')
    };
  }

  function validateCardRecord(record) {
    ensureObject(record, 'card');
    return {
      id: ensureUuidish(record.id, 'card.id'),
      deckId: ensureUuidish(record.deckId, 'card.deckId'),
      front: ensureString(record.front, 'card.front'),
      back: ensureString(record.back, 'card.back'),
      reading: optionalNullableString(record.reading, 'card.reading'),
      example: optionalNullableString(record.example, 'card.example'),
      memo: optionalNullableString(record.memo, 'card.memo'),
      tags: ensureTags(record.tags, 'card.tags'),
      imageMediaId: record.imageMediaId === null || record.imageMediaId === undefined || record.imageMediaId === '' ? null : ensureUuidish(record.imageMediaId, 'card.imageMediaId'),
      hlc: ensureHlc(record.hlc),
      createdAt: ensureIsoString(record.createdAt, 'card.createdAt'),
      deletedAt: ensureNullableIsoString(record.deletedAt, 'card.deletedAt')
    };
  }

  function validateReviewLogRecord(record) {
    ensureObject(record, 'reviewLog');
    return {
      id: ensureUuidish(record.id, 'reviewLog.id'),
      cardId: ensureUuidish(record.cardId, 'reviewLog.cardId'),
      rating: ensureRating(record.rating),
      reviewTime: ensureIsoString(record.reviewTime, 'reviewLog.reviewTime'),
      testType: ensureTestType(record.testType),
      durationMs: ensureNonNegativeInteger(record.durationMs, 'reviewLog.durationMs'),
      deviceId: ensureUuidish(record.deviceId, 'reviewLog.deviceId')
    };
  }

  function validateMediaRecord(record) {
    ensureObject(record, 'media');
    PureMediaValidation.validateRequest(record);
    return {
      id: ensureUuidish(record.id, 'media.id'),
      sha256: String(record.sha256).toLowerCase(),
      mime: ensureString(record.mime, 'media.mime'),
      size: ensureNonNegativeInteger(record.size, 'media.size'),
      uploaded: !!record.uploaded,
      hlc: ensureHlc(record.hlc),
      createdAt: ensureIsoString(record.createdAt, 'media.createdAt'),
      deletedAt: ensureNullableIsoString(record.deletedAt, 'media.deletedAt')
    };
  }

  function validateSyncChanges(payload) {
    ensureObject(payload, 'payload');
    ensureObject(payload.changes, 'payload.changes');
    return {
      decks: Array.isArray(payload.changes.decks) ? payload.changes.decks.map(validateDeckRecord) : fail('payload.changes.decks must be an array'),
      cards: Array.isArray(payload.changes.cards) ? payload.changes.cards.map(validateCardRecord) : fail('payload.changes.cards must be an array'),
      reviewLogs: Array.isArray(payload.changes.reviewLogs) ? payload.changes.reviewLogs.map(validateReviewLogRecord) : fail('payload.changes.reviewLogs must be an array'),
      media: Array.isArray(payload.changes.media) ? payload.changes.media.map(validateMediaRecord) : fail('payload.changes.media must be an array')
    };
  }

  function validateMediaUploadRequest(payload) {
    ensureObject(payload, 'payload');
    var request = {
      id: ensureUuidish(payload.id, 'payload.id'),
      sha256: String(payload.sha256 || '').toLowerCase(),
      mime: ensureString(payload.mime, 'payload.mime'),
      size: ensureNonNegativeInteger(payload.size, 'payload.size')
    };
    PureMediaValidation.validateRequest(request);
    return request;
  }

  function validateMediaUploadChunk(payload) {
    ensureObject(payload, 'payload');
    var chunk = {
      id: ensureUuidish(payload.id, 'payload.id'),
      base64Chunk: ensureString(payload.base64Chunk, 'payload.base64Chunk'),
      chunkIndex: ensureInteger(payload.chunkIndex, 'payload.chunkIndex'),
      totalChunks: ensureInteger(payload.totalChunks, 'payload.totalChunks'),
      sha256: String(payload.sha256 || '').toLowerCase()
    };
    PureMediaValidation.validateChunkPayload(chunk);
    return chunk;
  }

  return {
    fail: fail,
    ensureObject: ensureObject,
    ensureString: ensureString,
    ensureUuidish: ensureUuidish,
    ensureShareCode: ensureShareCode,
    ensureIsoString: ensureIsoString,
    ensureNullableIsoString: ensureNullableIsoString,
    ensureHlc: ensureHlc,
    ensurePullLimit: ensurePullLimit,
    ensureInteger: ensureInteger,
    ensureNonNegativeInteger: ensureNonNegativeInteger,
    validateDeckRecord: validateDeckRecord,
    validateCardRecord: validateCardRecord,
    validateReviewLogRecord: validateReviewLogRecord,
    validateMediaRecord: validateMediaRecord,
    validateSyncChanges: validateSyncChanges,
    validateMediaUploadRequest: validateMediaUploadRequest,
    validateMediaUploadChunk: validateMediaUploadChunk
  };
})();
