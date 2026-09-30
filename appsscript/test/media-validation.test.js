const test = require('node:test');
const assert = require('node:assert/strict');

const PureMediaValidation = require('../src/pure/mediaValidation');
const AppError = require('../src/pure/AppError');

function expectValidation(fn, messagePart) {
  assert.throws(fn, (error) => error instanceof AppError && error.code === 'validation' && error.message.includes(messagePart));
}

test('media request validation accepts supported boundaries', () => {
  PureMediaValidation.validateRequest({
    sha256: 'a'.repeat(64),
    mime: 'image/png',
    size: PureMediaValidation.MAX_MEDIA_BYTES
  });
});

test('media request validation rejects oversize files and bad mime types', () => {
  expectValidation(() => PureMediaValidation.validateRequest({
    sha256: 'a'.repeat(64),
    mime: 'image/svg+xml',
    size: 100
  }), 'allowed image type');

  expectValidation(() => PureMediaValidation.validateRequest({
    sha256: 'a'.repeat(64),
    mime: 'image/png',
    size: PureMediaValidation.MAX_MEDIA_BYTES + 1
  }), 'supported limit');
});

test('media chunk validation enforces chunk bounds', () => {
  PureMediaValidation.validateChunkPayload({
    sha256: 'b'.repeat(64),
    base64Chunk: 'QUJDRA==',
    chunkIndex: 0,
    totalChunks: 1
  });

  expectValidation(() => PureMediaValidation.validateChunkPayload({
    sha256: 'b'.repeat(64),
    base64Chunk: 'A'.repeat(PureMediaValidation.MAX_BASE64_CHARS_PER_CHUNK + 1),
    chunkIndex: 0,
    totalChunks: 1
  }), 'supported limit');

  expectValidation(() => PureMediaValidation.validateChunkPayload({
    sha256: 'b'.repeat(64),
    base64Chunk: '***not-base64***',
    chunkIndex: 0,
    totalChunks: 1
  }), 'base64');

  expectValidation(() => PureMediaValidation.validateChunkPayload({
    sha256: 'b'.repeat(64),
    base64Chunk: 'QUJDRA==',
    chunkIndex: 1,
    totalChunks: 1
  }), 'out of range');
});
