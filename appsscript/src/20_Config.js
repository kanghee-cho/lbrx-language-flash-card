var Config = (function () {
  var spreadsheetMemo = null;
  var allowedClientIdsMemo = null;

  function getScriptProperties() {
    return PropertiesService.getScriptProperties();
  }

  function getRequiredProperty(name) {
    var value = getScriptProperties().getProperty(name);
    if (!value) {
      throw new AppError('internal', name + ' is not configured');
    }
    return value;
  }

  function getSpreadsheet() {
    if (!spreadsheetMemo) {
      spreadsheetMemo = SpreadsheetApp.openById(getRequiredProperty('SPREADSHEET_ID'));
    }
    return spreadsheetMemo;
  }

  function getOrCreateSheet(name, headerRow) {
    var sheet = getSpreadsheet().getSheetByName(name);
    if (!sheet) {
      sheet = getSpreadsheet().insertSheet(name);
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
      return sheet;
    }

    var existingHeader = sheet.getRange(1, 1, 1, headerRow.length).getValues()[0];
    var isBlank = existingHeader.every(function (value) {
      return value === '' || value === null;
    });

    if (isBlank) {
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
      return sheet;
    }

    var mismatch = headerRow.some(function (value, index) {
      return String(existingHeader[index] || '') !== value;
    });
    if (mismatch) {
      throw new AppError('internal', 'Sheet header mismatch for ' + name);
    }
    return sheet;
  }

  function getAllowedClientIds() {
    if (!allowedClientIdsMemo) {
      allowedClientIdsMemo = getRequiredProperty('GOOGLE_CLIENT_IDS')
        .split(',')
        .map(function (value) { return value.trim(); })
        .filter(function (value) { return !!value; });
    }
    return allowedClientIdsMemo.slice();
  }

  return {
    getScriptProperties: getScriptProperties,
    getRequiredProperty: getRequiredProperty,
    getSpreadsheet: getSpreadsheet,
    getOrCreateSheet: getOrCreateSheet,
    getAllowedClientIds: getAllowedClientIds
  };
})();
