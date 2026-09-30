var Auth = (function () {
  function withLock(work) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      return work();
    } finally {
      lock.releaseLock();
    }
  }

  function hashText(text) {
    return Store.bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text));
  }

  function verifyIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
      throw new AppError('unauthorized', 'Missing Google ID token');
    }

    var cache = CacheService.getScriptCache();
    var cacheKey = 'token:' + hashText(idToken).slice(0, 40);
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Apps Script lacks a native JWT verification library. Using Google's tokeninfo
    // endpoint adds a network hop, but it avoids hand-rolled RS256/JWKS logic inside
    // a constrained runtime and is far easier to operate correctly.
    var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
      method: 'get',
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new AppError('unauthorized', 'Invalid Google ID token');
    }

    var parsed;
    try {
      parsed = JSON.parse(response.getContentText());
    } catch (error) {
      throw new AppError('unauthorized', 'Token verification failed');
    }

    var verified = PureTokenInfo.validateTokenInfo(parsed, Config.getAllowedClientIds(), Math.floor(Date.now() / 1000));

    var allowedEmails = Config.getAllowedEmails();
    if (allowedEmails.length > 0 && allowedEmails.indexOf(verified.email.toLowerCase()) === -1) {
      throw new AppError('unauthorized', 'This Google account is not permitted to use this app');
    }

    cache.put(cacheKey, JSON.stringify(verified), 60);
    return verified;
  }

  function ping(user) {
    return withLock(function () {
      var now = new Date().toISOString();
      var usersState = Store.loadSheet('Users');
      var existing = usersState.byId[user.sub];
      var isNew = !existing;

      if (existing) {
        var changed = false;
        if (existing.email !== user.email) {
          existing.email = user.email;
          changed = true;
        }
        if (existing.lastSeenAt !== now) {
          existing.lastSeenAt = now;
          changed = true;
        }
        if (changed) {
          Store.writeSheet('Users', usersState.rows);
        }
      } else {
        usersState.rows.push({
          userId: user.sub,
          email: user.email,
          createdAt: now,
          lastSeenAt: now
        });
        Store.writeSheet('Users', usersState.rows);
      }

      return {
        userId: user.sub,
        email: user.email,
        isNew: isNew
      };
    });
  }

  return {
    verifyIdToken: verifyIdToken,
    ping: ping
  };
})();
