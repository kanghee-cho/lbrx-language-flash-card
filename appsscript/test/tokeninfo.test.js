const test = require('node:test');
const assert = require('node:assert/strict');

const PureTokenInfo = require('../src/pure/tokeninfo');
const AppError = require('../src/pure/AppError');

function expectUnauthorized(fn, messagePart) {
  assert.throws(fn, (error) => error instanceof AppError && error.code === 'unauthorized' && error.message.includes(messagePart));
}

test('tokeninfo validation accepts valid Google token metadata', () => {
  const result = PureTokenInfo.validateTokenInfo({
    sub: '12345',
    aud: 'client-1',
    iss: 'https://accounts.google.com',
    exp: 200,
    email_verified: 'true',
    email: 'user@example.com'
  }, ['client-1', 'client-2'], 100);

  assert.deepEqual(result, {
    sub: '12345',
    email: 'user@example.com',
    emailVerified: true
  });
});

test('tokeninfo validation rejects expired tokens', () => {
  expectUnauthorized(() => PureTokenInfo.validateTokenInfo({
    sub: '12345',
    aud: 'client-1',
    iss: 'accounts.google.com',
    exp: 100,
    email_verified: true,
    email: 'user@example.com'
  }, ['client-1'], 100), 'expired');
});

test('tokeninfo validation rejects wrong audience, issuer, or unverified email', () => {
  expectUnauthorized(() => PureTokenInfo.validateTokenInfo({
    sub: '12345',
    aud: 'other-client',
    iss: 'accounts.google.com',
    exp: 200,
    email_verified: true,
    email: 'user@example.com'
  }, ['client-1'], 100), 'audience');

  expectUnauthorized(() => PureTokenInfo.validateTokenInfo({
    sub: '12345',
    aud: 'client-1',
    iss: 'https://evil.example',
    exp: 200,
    email_verified: true,
    email: 'user@example.com'
  }, ['client-1'], 100), 'issuer');

  expectUnauthorized(() => PureTokenInfo.validateTokenInfo({
    sub: '12345',
    aud: 'client-1',
    iss: 'accounts.google.com',
    exp: 200,
    email_verified: false,
    email: 'user@example.com'
  }, ['client-1'], 100), 'verified');
});
