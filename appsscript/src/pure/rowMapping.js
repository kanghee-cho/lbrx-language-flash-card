(function (root, factory) {
  var api = factory(root.PureAppError);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.PureRowMapping = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PureAppError) {
  if (!PureAppError && typeof require === 'function') {
    PureAppError = require('./AppError');
  }

  function toLookup(list) {
    var lookup = {};
    var index;
    for (index = 0; index < list.length; index += 1) {
      lookup[list[index]] = true;
    }
    return lookup;
  }

  function normalizeOptions(options) {
    options = options || {};
    return {
      jsonColumns: toLookup(options.jsonColumns || []),
      booleanColumns: toLookup(options.booleanColumns || []),
      numberColumns: toLookup(options.numberColumns || []),
      nullableColumns: toLookup(options.nullableColumns || [])
    };
  }

  function fromRow(header, row, options) {
    var normalized = normalizeOptions(options);
    var object = {};
    var index;
    for (index = 0; index < header.length; index += 1) {
      var key = header[index];
      var value = index < row.length ? row[index] : '';
      if (normalized.jsonColumns[key]) {
        object[key] = value === '' || value === null ? [] : JSON.parse(String(value));
      } else if (normalized.booleanColumns[key]) {
        object[key] = value === true || value === 'true';
      } else if (normalized.numberColumns[key]) {
        object[key] = value === '' || value === null ? null : Number(value);
      } else if (normalized.nullableColumns[key]) {
        object[key] = value === '' ? null : value;
      } else {
        object[key] = value;
      }
    }
    return object;
  }

  function toRow(header, object, options) {
    var normalized = normalizeOptions(options);
    return header.map(function (key) {
      var value = object[key];
      if (normalized.jsonColumns[key]) {
        if (!Array.isArray(value)) {
          throw new PureAppError('validation', 'Expected array for ' + key);
        }
        return JSON.stringify(value);
      }
      if (normalized.booleanColumns[key]) {
        return value ? true : false;
      }
      if (normalized.numberColumns[key]) {
        return value === null || value === undefined || value === '' ? '' : Number(value);
      }
      if (normalized.nullableColumns[key]) {
        return value === null || value === undefined ? '' : value;
      }
      return value === null || value === undefined ? '' : value;
    });
  }

  return {
    fromRow: fromRow,
    toRow: toRow
  };
});
