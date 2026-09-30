var Store = (function () {
  function getDefinition(sheetName) {
    var definition = AppConstants.SHEETS[sheetName];
    if (!definition) {
      throw new AppError('internal', 'Unknown sheet ' + sheetName);
    }
    return definition;
  }

  function rowHasAnyValue(row) {
    return row.some(function (value) {
      return value !== '' && value !== null;
    });
  }

  function loadSheet(sheetName) {
    var definition = getDefinition(sheetName);
    var sheet = Config.getOrCreateSheet(definition.name, definition.header);
    var values = sheet.getDataRange().getValues();
    var rows = [];
    var byId = {};
    var rowIndex = {};
    var index;
    for (index = 1; index < values.length; index += 1) {
      if (!rowHasAnyValue(values[index])) {
        continue;
      }
      var normalized = values[index].slice(0, definition.header.length);
      while (normalized.length < definition.header.length) {
        normalized.push('');
      }
      var object = PureRowMapping.fromRow(definition.header, normalized, definition.schema);
      rows.push(object);
      rowIndex[object[definition.idColumn]] = rows.length - 1;
      byId[object[definition.idColumn]] = object;
    }
    return {
      definition: definition,
      sheet: sheet,
      rows: rows,
      byId: byId,
      rowIndex: rowIndex
    };
  }

  function writeSheet(sheetName, rows) {
    var definition = getDefinition(sheetName);
    var sheet = Config.getOrCreateSheet(definition.name, definition.header);
    var matrix = [definition.header].concat(rows.map(function (row) {
      return PureRowMapping.toRow(definition.header, row, definition.schema);
    }));
    sheet.clearContents();
    sheet.getRange(1, 1, matrix.length, definition.header.length).setValues(matrix);
  }

  function bytesToHex(bytes) {
    return (bytes || []).map(function (value) {
      var normalized = value < 0 ? value + 256 : value;
      var hex = normalized.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function loadMetaState() {
    return loadSheet('Meta');
  }

  function getMetaValue(metaState, key) {
    var row = metaState.byId[key];
    return row ? String(row.value || '') : '';
  }

  function putMetaValue(metaState, key, value) {
    var existing = metaState.byId[key];
    if (existing) {
      existing.value = String(value);
    } else {
      var created = { key: key, value: String(value) };
      metaState.rows.push(created);
      metaState.byId[key] = created;
    }
  }

  function reserveServerSeqs(metaState, count) {
    if (!count) {
      return [];
    }
    var currentValue = getMetaValue(metaState, AppConstants.META_KEYS.NEXT_SERVER_SEQ);
    var start = currentValue ? Number(currentValue) : 1;
    if (!isFinite(start) || start < 1) {
      start = 1;
    }
    putMetaValue(metaState, AppConstants.META_KEYS.NEXT_SERVER_SEQ, start + count);
    var result = [];
    var index;
    for (index = 0; index < count; index += 1) {
      result.push(start + index);
    }
    return result;
  }

  function getOrCreateMediaFolder(metaState) {
    var folderId = getMetaValue(metaState, AppConstants.META_KEYS.MEDIA_FOLDER_ID);
    if (folderId) {
      return DriveApp.getFolderById(folderId);
    }
    var folder = DriveApp.createFolder('lbrx-language-flash-card-media');
    putMetaValue(metaState, AppConstants.META_KEYS.MEDIA_FOLDER_ID, folder.getId());
    return folder;
  }

  function uniqueStrings(values) {
    var seen = {};
    var result = [];
    values.forEach(function (value) {
      if (value && !seen[value]) {
        seen[value] = true;
        result.push(value);
      }
    });
    return result;
  }

  return {
    loadSheet: loadSheet,
    writeSheet: writeSheet,
    bytesToHex: bytesToHex,
    loadMetaState: loadMetaState,
    getMetaValue: getMetaValue,
    putMetaValue: putMetaValue,
    reserveServerSeqs: reserveServerSeqs,
    getOrCreateMediaFolder: getOrCreateMediaFolder,
    uniqueStrings: uniqueStrings
  };
})();
