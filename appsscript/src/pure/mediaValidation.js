(function (root, factory) {
  var api = factory(root.PureAppError);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PureMediaValidation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PureAppError) {
  if (!PureAppError && typeof require === 'function') {
    PureAppError = require('./AppError');
  }

  var ALLOWED_MIME = {
    'image/gif': true,
    'image/jpeg': true,
    'image/png': true,
    'image/webp': true
  };
  var SHA256_RE = /^[a-f0-9]{64}$/i;
  var MAX_MEDIA_BYTES = 2 * 1024 * 1024;
  var MAX_BASE64_CHARS_PER_CHUNK = 90000;
  var BASE64_CHUNK_RE = /^[A-Za-z0-9+/=]+$/;

  function validateSha256(sha256) {
    if (typeof sha256 !== 'string' || !SHA256_RE.test(sha256)) {
      throw new PureAppError('validation', 'sha256 must be a 64-character hex string');
    }
  }

  function validateMime(mime) {
    if (typeof mime !== 'string' || !ALLOWED_MIME[mime]) {
      throw new PureAppError('validation', 'mime must be an allowed image type');
    }
  }

  function validateSize(size) {
    var numeric = Number(size);
    if (!isFinite(numeric) || numeric <= 0 || numeric > MAX_MEDIA_BYTES) {
      throw new PureAppError('validation', 'size exceeds the supported limit');
    }
  }

  function validateRequest(payload) {
    validateSha256(payload.sha256);
    validateMime(payload.mime);
    validateSize(payload.size);
  }

  function validateChunkPayload(payload) {
    validateSha256(payload.sha256);
    if (typeof payload.base64Chunk !== 'string' || payload.base64Chunk.length === 0) {
      throw new PureAppError('validation', 'base64Chunk is required');
    }
    if (payload.base64Chunk.length > MAX_BASE64_CHARS_PER_CHUNK) {
      throw new PureAppError('validation', 'base64Chunk exceeds the supported limit');
    }
    if (!BASE64_CHUNK_RE.test(payload.base64Chunk)) {
      throw new PureAppError('validation', 'base64Chunk must be base64 text');
    }

    var chunkIndex = Number(payload.chunkIndex);
    var totalChunks = Number(payload.totalChunks);
    if (!Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks) || totalChunks <= 0) {
      throw new PureAppError('validation', 'chunkIndex and totalChunks must be integers');
    }
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw new PureAppError('validation', 'chunkIndex is out of range');
    }
  }

  return {
    ALLOWED_MIME: ALLOWED_MIME,
    SHA256_RE: SHA256_RE,
    MAX_MEDIA_BYTES: MAX_MEDIA_BYTES,
    MAX_BASE64_CHARS_PER_CHUNK: MAX_BASE64_CHARS_PER_CHUNK,
    validateSha256: validateSha256,
    validateMime: validateMime,
    validateSize: validateSize,
    validateRequest: validateRequest,
    validateChunkPayload: validateChunkPayload
  };
});
