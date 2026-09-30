var ShareService = (function () {
  function withLock(work) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      return work();
    } finally {
      lock.releaseLock();
    }
  }

  function generateShareCode(existingCodes) {
    var attempt;
    for (attempt = 0; attempt < 20; attempt += 1) {
      var seed = Utilities.getUuid() + ':' + new Date().getTime() + ':' + Math.random();
      var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
      var code = PureShareCode.generateFromBytes(digest);
      if (!existingCodes[code]) {
        return code;
      }
    }
    throw new AppError('internal', 'Unable to allocate a unique share code');
  }

  function create(user, payload) {
    return withLock(function () {
      Validation.ensureObject(payload || {}, 'payload');
      var deckId = Validation.ensureUuidish(payload.deckId, 'payload.deckId');
      var deckState = Store.loadSheet('Decks');
      var shareState = Store.loadSheet('Shares');
      var metaState = Store.loadMetaState();
      var deck = deckState.byId[deckId];
      if (!deck || deck.userId !== user.sub || deck.deletedAt) {
        throw new AppError('not_found', 'Deck was not found');
      }

      var existing = shareState.rows.find(function (row) {
        return row.userId === user.sub && row.deckId === deckId && !row.revokedAt;
      });
      if (existing) {
        return {
          id: existing.id,
          code: existing.code,
          deckId: existing.deckId,
          createdAt: existing.createdAt,
          revokedAt: existing.revokedAt
        };
      }

      var existingCodes = {};
      shareState.rows.forEach(function (row) {
        existingCodes[row.code] = true;
      });
      var row = {
        userId: user.sub,
        serverSeq: null,
        id: Utilities.getUuid(),
        code: generateShareCode(existingCodes),
        deckId: deckId,
        createdAt: new Date().toISOString(),
        revokedAt: null
      };
      shareState.rows.push(row);
      shareState.byId[row.id] = row;
      row.serverSeq = Store.reserveServerSeqs(metaState, 1)[0];
      Store.writeSheet('Shares', shareState.rows);
      Store.writeSheet('Meta', metaState.rows);
      return {
        id: row.id,
        code: row.code,
        deckId: row.deckId,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt
      };
    });
  }

  function get(payload) {
    Validation.ensureObject(payload || {}, 'payload');
    var code = Validation.ensureShareCode(payload.code);
    var shareState = Store.loadSheet('Shares');
    var deckState = Store.loadSheet('Decks');
    var cardState = Store.loadSheet('Cards');
    var share = shareState.rows.find(function (row) {
      return row.code === code;
    });
    if (!share || share.revokedAt) {
      throw new AppError('not_found', 'Share was not found');
    }
    var deck = deckState.byId[share.deckId];
    if (!deck || deck.userId !== share.userId || deck.deletedAt) {
      throw new AppError('not_found', 'Shared deck is no longer available');
    }
    var cardCount = cardState.rows.filter(function (row) {
      return row.userId === share.userId && row.deckId === share.deckId && !row.deletedAt;
    }).length;
    return {
      code: share.code,
      deckId: share.deckId,
      name: deck.name,
      description: deck.description,
      sourceLang: deck.sourceLang,
      targetLang: deck.targetLang,
      cardCount: cardCount
    };
  }

  function revoke(user, payload) {
    return withLock(function () {
      Validation.ensureObject(payload || {}, 'payload');
      var code = Validation.ensureShareCode(payload.code);
      var shareState = Store.loadSheet('Shares');
      var metaState = Store.loadMetaState();
      var share = shareState.rows.find(function (row) {
        return row.code === code;
      });
      if (!share || share.revokedAt) {
        throw new AppError('not_found', 'Share was not found');
      }
      if (share.userId !== user.sub) {
        throw new AppError('forbidden', 'Share is owned by another user');
      }
      share.revokedAt = new Date().toISOString();
      share.serverSeq = Store.reserveServerSeqs(metaState, 1)[0];
      Store.writeSheet('Shares', shareState.rows);
      Store.writeSheet('Meta', metaState.rows);
      return {
        code: share.code,
        revokedAt: share.revokedAt
      };
    });
  }

  function importShare(user, payload) {
    return withLock(function () {
      Validation.ensureObject(payload || {}, 'payload');
      var code = Validation.ensureShareCode(payload.code);
      var shareState = Store.loadSheet('Shares');
      var deckState = Store.loadSheet('Decks');
      var cardState = Store.loadSheet('Cards');
      var mediaState = Store.loadSheet('Media');
      var metaState = Store.loadMetaState();

      var share = shareState.rows.find(function (row) {
        return row.code === code;
      });
      if (!share || share.revokedAt) {
        throw new AppError('not_found', 'Share was not found');
      }

      var sourceDeck = deckState.byId[share.deckId];
      if (!sourceDeck || sourceDeck.userId !== share.userId || sourceDeck.deletedAt) {
        throw new AppError('not_found', 'Shared deck is no longer available');
      }

      var sourceCards = cardState.rows.filter(function (row) {
        return row.userId === share.userId && row.deckId === share.deckId && !row.deletedAt;
      });
      var sourceMediaIds = Store.uniqueStrings(sourceCards.map(function (row) { return row.imageMediaId; }));
      var sourceMedia = sourceMediaIds.map(function (mediaId) {
        return mediaState.byId[mediaId];
      }).filter(function (row) {
        return row && row.userId === share.userId && !row.deletedAt;
      });

      var nowMillis = Date.now();
      var nowIso = new Date(nowMillis).toISOString();
      var hlcCounter = 0;
      function nextHlc() {
        var value = PureHlc.mint(nowMillis, hlcCounter, 'server');
        hlcCounter += 1;
        return value;
      }

      var mediaIdMap = {};
      var folder = sourceMedia.length ? Store.getOrCreateMediaFolder(metaState) : null;
      var newMediaRows = sourceMedia.map(function (row) {
        var copiedDriveFileId = null;
        if (row.uploaded && row.driveFileId) {
          var originalBlob = DriveApp.getFileById(row.driveFileId).getBlob();
          copiedDriveFileId = folder.createFile(originalBlob).getId();
        }
        var nextId = Utilities.getUuid();
        mediaIdMap[row.id] = nextId;
        return {
          userId: user.sub,
          serverSeq: null,
          id: nextId,
          sha256: row.sha256,
          mime: row.mime,
          size: row.size,
          uploaded: !!row.uploaded,
          driveFileId: copiedDriveFileId,
          hlc: nextHlc(),
          createdAt: nowIso,
          deletedAt: null
        };
      });

      var newDeckId = Utilities.getUuid();
      var newDeckRow = {
        userId: user.sub,
        serverSeq: null,
        id: newDeckId,
        name: sourceDeck.name,
        description: sourceDeck.description,
        sourceLang: sourceDeck.sourceLang,
        targetLang: sourceDeck.targetLang,
        tags: sourceDeck.tags,
        hlc: nextHlc(),
        createdAt: nowIso,
        deletedAt: null
      };
      var newCardRows = sourceCards.map(function (row) {
        return {
          userId: user.sub,
          serverSeq: null,
          id: Utilities.getUuid(),
          deckId: newDeckId,
          front: row.front,
          back: row.back,
          reading: row.reading,
          example: row.example,
          memo: row.memo,
          tags: row.tags,
          imageMediaId: row.imageMediaId ? (mediaIdMap[row.imageMediaId] || null) : null,
          hlc: nextHlc(),
          createdAt: nowIso,
          deletedAt: null
        };
      });

      var allNewRows = [newDeckRow].concat(newMediaRows, newCardRows);
      var reservedSeqs = Store.reserveServerSeqs(metaState, allNewRows.length);
      allNewRows.forEach(function (row, index) {
        row.serverSeq = reservedSeqs[index];
      });

      deckState.rows.push(newDeckRow);
      deckState.byId[newDeckRow.id] = newDeckRow;
      newMediaRows.forEach(function (row) {
        mediaState.rows.push(row);
        mediaState.byId[row.id] = row;
      });
      newCardRows.forEach(function (row) {
        cardState.rows.push(row);
        cardState.byId[row.id] = row;
      });

      Store.writeSheet('Decks', deckState.rows);
      Store.writeSheet('Cards', cardState.rows);
      if (newMediaRows.length) {
        Store.writeSheet('Media', mediaState.rows);
      }
      Store.writeSheet('Meta', metaState.rows);

      return {
        deckId: newDeckId,
        importedCardCount: newCardRows.length,
        importedMediaCount: newMediaRows.length
      };
    });
  }

  return {
    create: create,
    get: get,
    revoke: revoke,
    importShare: importShare
  };
})();
