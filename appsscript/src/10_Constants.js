var AppConstants = (function () {
  var SHEETS = {
    Users: {
      name: 'Users',
      header: ['userId', 'email', 'createdAt', 'lastSeenAt'],
      schema: {
        nullableColumns: []
      },
      idColumn: 'userId'
    },
    Decks: {
      name: 'Decks',
      header: ['userId', 'serverSeq', 'id', 'name', 'description', 'sourceLang', 'targetLang', 'tags', 'hlc', 'createdAt', 'deletedAt'],
      schema: {
        jsonColumns: ['tags'],
        numberColumns: ['serverSeq'],
        nullableColumns: ['description', 'deletedAt']
      },
      idColumn: 'id'
    },
    Cards: {
      name: 'Cards',
      header: ['userId', 'serverSeq', 'id', 'deckId', 'front', 'back', 'reading', 'example', 'memo', 'tags', 'imageMediaId', 'hlc', 'createdAt', 'deletedAt'],
      schema: {
        jsonColumns: ['tags'],
        numberColumns: ['serverSeq'],
        nullableColumns: ['reading', 'example', 'memo', 'imageMediaId', 'deletedAt']
      },
      idColumn: 'id'
    },
    ReviewLogs: {
      name: 'ReviewLogs',
      header: ['userId', 'serverSeq', 'id', 'cardId', 'rating', 'reviewTime', 'testType', 'durationMs', 'deviceId'],
      schema: {
        numberColumns: ['serverSeq', 'rating', 'durationMs']
      },
      idColumn: 'id'
    },
    Media: {
      name: 'Media',
      header: ['userId', 'serverSeq', 'id', 'sha256', 'mime', 'size', 'uploaded', 'driveFileId', 'hlc', 'createdAt', 'deletedAt'],
      schema: {
        booleanColumns: ['uploaded'],
        numberColumns: ['serverSeq', 'size'],
        nullableColumns: ['driveFileId', 'deletedAt']
      },
      idColumn: 'id'
    },
    Shares: {
      name: 'Shares',
      header: ['userId', 'serverSeq', 'id', 'code', 'deckId', 'createdAt', 'revokedAt'],
      schema: {
        numberColumns: ['serverSeq'],
        nullableColumns: ['revokedAt']
      },
      idColumn: 'id'
    },
    Meta: {
      name: 'Meta',
      header: ['key', 'value'],
      schema: {},
      idColumn: 'key'
    }
  };

  return {
    SHEETS: SHEETS,
    ENTITY_SHEETS: ['Decks', 'Cards', 'ReviewLogs', 'Media'],
    DEFAULT_PULL_LIMIT: 500,
    MAX_PULL_LIMIT: 2000,
    MEDIA_CACHE_TTL_SECONDS: 3600,
    META_KEYS: {
      NEXT_SERVER_SEQ: 'nextServerSeq',
      MEDIA_FOLDER_ID: 'mediaFolderId'
    }
  };
})();
