var SyncService = (function () {
  function withLock(work) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      return work();
    } finally {
      lock.releaseLock();
    }
  }

  function toDeckRecord(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      sourceLang: row.sourceLang,
      targetLang: row.targetLang,
      tags: row.tags,
      hlc: row.hlc,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt
    };
  }

  function toCardRecord(row) {
    return {
      id: row.id,
      deckId: row.deckId,
      front: row.front,
      back: row.back,
      reading: row.reading,
      example: row.example,
      memo: row.memo,
      tags: row.tags,
      imageMediaId: row.imageMediaId,
      hlc: row.hlc,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt
    };
  }

  function toReviewLogRecord(row) {
    return {
      id: row.id,
      cardId: row.cardId,
      rating: row.rating,
      reviewTime: row.reviewTime,
      testType: row.testType,
      durationMs: row.durationMs,
      deviceId: row.deviceId
    };
  }

  function toMediaRecord(row) {
    return {
      id: row.id,
      sha256: row.sha256,
      mime: row.mime,
      size: row.size,
      uploaded: !!row.uploaded,
      hlc: row.hlc,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt
    };
  }

  function loadSyncSheets() {
    return {
      decks: Store.loadSheet('Decks'),
      cards: Store.loadSheet('Cards'),
      reviewLogs: Store.loadSheet('ReviewLogs'),
      media: Store.loadSheet('Media')
    };
  }

  function pull(user, payload) {
    payload = payload || {};
    var cursor = payload.cursor === undefined || payload.cursor === null || payload.cursor === '' ? 0 : Validation.ensureNonNegativeInteger(payload.cursor, 'cursor');
    var limit = Validation.ensurePullLimit(payload.limit);
    var state = loadSyncSheets();

    function ownedRows(sheetState) {
      return sheetState.rows.filter(function (row) {
        return row.userId === user.sub;
      });
    }

    var deckSlice = PurePagination.sliceByCursor(ownedRows(state.decks), cursor, limit);
    var cardSlice = PurePagination.sliceByCursor(ownedRows(state.cards), cursor, limit);
    var reviewSlice = PurePagination.sliceByCursor(ownedRows(state.reviewLogs), cursor, limit);
    var mediaSlice = PurePagination.sliceByCursor(ownedRows(state.media), cursor, limit);
    var allReturned = deckSlice.items.concat(cardSlice.items, reviewSlice.items, mediaSlice.items);
    var nextCursor = PurePagination.combineSlices(cursor, [deckSlice, cardSlice, reviewSlice, mediaSlice]);

    return {
      decks: deckSlice.items.map(toDeckRecord),
      cards: cardSlice.items.map(toCardRecord),
      reviewLogs: reviewSlice.items.map(toReviewLogRecord),
      media: mediaSlice.items.map(toMediaRecord),
      nextCursor: nextCursor,
      hasMore: deckSlice.hasMore || cardSlice.hasMore || reviewSlice.hasMore || mediaSlice.hasMore
    };
  }

  function push(user, payload) {
    return withLock(function () {
      var changes = Validation.validateSyncChanges(payload);
      var state = loadSyncSheets();
      var changedRows = [];
      var dirtySheets = {};
      var result = {
        accepted: 0,
        ignored: 0,
        rejected: []
      };

      function markDirty(sheetName) {
        dirtySheets[sheetName] = true;
      }

      function acceptRow(sheetName, row) {
        changedRows.push(row);
        markDirty(sheetName);
        result.accepted += 1;
      }

      function reject(entity, id, reason) {
        result.rejected.push({ entity: entity, id: id, reason: reason });
      }

      function processLwwEntity(entityName, sheetState, record, rowFactory, dependencyCheck) {
        if (dependencyCheck) {
          var dependencyReason = dependencyCheck(record);
          if (dependencyReason) {
            reject(entityName, record.id, dependencyReason);
            return;
          }
        }

        var existing = sheetState.byId[record.id];
        var decision = PureDecideApply.decideApply(existing ? existing.hlc : null, record.hlc, existing ? existing.userId : null, user.sub);
        if (decision.action === 'reject') {
          reject(entityName, record.id, decision.reason);
          return;
        }
        if (decision.action === 'ignore') {
          result.ignored += 1;
          return;
        }

        var nextRow = rowFactory(record, existing);
        if (existing) {
          var rowIndex = sheetState.rowIndex[record.id];
          sheetState.rows[rowIndex] = nextRow;
          sheetState.byId[record.id] = nextRow;
        } else {
          sheetState.rowIndex[record.id] = sheetState.rows.length;
          sheetState.rows.push(nextRow);
          sheetState.byId[record.id] = nextRow;
        }
        acceptRow(sheetState.definition.name, nextRow);
      }

      changes.decks.forEach(function (record) {
        processLwwEntity('deck', state.decks, record, function (incoming, existing) {
          return {
            userId: user.sub,
            serverSeq: existing ? existing.serverSeq : null,
            id: incoming.id,
            name: incoming.name,
            description: incoming.description,
            sourceLang: incoming.sourceLang,
            targetLang: incoming.targetLang,
            tags: incoming.tags,
            hlc: incoming.hlc,
            createdAt: incoming.createdAt,
            deletedAt: incoming.deletedAt
          };
        });
      });

      changes.media.forEach(function (record) {
        processLwwEntity('media', state.media, record, function (incoming, existing) {
          return {
            userId: user.sub,
            serverSeq: existing ? existing.serverSeq : null,
            id: incoming.id,
            sha256: incoming.sha256.toLowerCase(),
            mime: incoming.mime,
            size: incoming.size,
            uploaded: !!incoming.uploaded,
            driveFileId: existing ? existing.driveFileId : null,
            hlc: incoming.hlc,
            createdAt: incoming.createdAt,
            deletedAt: incoming.deletedAt
          };
        });
      });

      changes.cards.forEach(function (record) {
        processLwwEntity('card', state.cards, record, function (incoming, existing) {
          return {
            userId: user.sub,
            serverSeq: existing ? existing.serverSeq : null,
            id: incoming.id,
            deckId: incoming.deckId,
            front: incoming.front,
            back: incoming.back,
            reading: incoming.reading,
            example: incoming.example,
            memo: incoming.memo,
            tags: incoming.tags,
            imageMediaId: incoming.imageMediaId,
            hlc: incoming.hlc,
            createdAt: incoming.createdAt,
            deletedAt: incoming.deletedAt
          };
        }, function (incoming) {
          var deck = state.decks.byId[incoming.deckId];
          if (!deck || deck.userId !== user.sub) {
            return 'deck_not_owned';
          }
          if (incoming.imageMediaId) {
            var media = state.media.byId[incoming.imageMediaId];
            if (!media || media.userId !== user.sub) {
              return 'media_not_owned';
            }
          }
          return null;
        });
      });

      changes.reviewLogs.forEach(function (record) {
        var existing = state.reviewLogs.byId[record.id];
        if (existing) {
          if (existing.userId !== user.sub) {
            reject('reviewLog', record.id, 'owner_mismatch');
          } else {
            result.ignored += 1;
          }
          return;
        }
        var card = state.cards.byId[record.cardId];
        if (!card || card.userId !== user.sub) {
          reject('reviewLog', record.id, 'card_not_owned');
          return;
        }
        var created = {
          userId: user.sub,
          serverSeq: null,
          id: record.id,
          cardId: record.cardId,
          rating: record.rating,
          reviewTime: record.reviewTime,
          testType: record.testType,
          durationMs: record.durationMs,
          deviceId: record.deviceId
        };
        state.reviewLogs.rowIndex[record.id] = state.reviewLogs.rows.length;
        state.reviewLogs.rows.push(created);
        state.reviewLogs.byId[record.id] = created;
        acceptRow('ReviewLogs', created);
      });

      var metaState = Store.loadMetaState();
      var reservedSeqs = Store.reserveServerSeqs(metaState, changedRows.length);
      changedRows.forEach(function (row, index) {
        row.serverSeq = reservedSeqs[index];
      });

      if (dirtySheets.Decks) {
        Store.writeSheet('Decks', state.decks.rows);
      }
      if (dirtySheets.Cards) {
        Store.writeSheet('Cards', state.cards.rows);
      }
      if (dirtySheets.ReviewLogs) {
        Store.writeSheet('ReviewLogs', state.reviewLogs.rows);
      }
      if (dirtySheets.Media) {
        Store.writeSheet('Media', state.media.rows);
      }
      if (changedRows.length) {
        Store.writeSheet('Meta', metaState.rows);
      }

      return result;
    });
  }

  return {
    pull: pull,
    push: push,
    toDeckRecord: toDeckRecord,
    toCardRecord: toCardRecord,
    toMediaRecord: toMediaRecord
  };
})();
