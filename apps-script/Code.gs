/**
 * Clubhouse scoreboard — Google Sheets backend.
 *
 * Deployment steps are in apps-script/README.md.
 * Set SHEET_ID to the id in your spreadsheet URL:
 *   https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
 */
const SHEET_ID = '1G0AsKyzqVSLKnxyHgKdZgMKsZzf2HwgChOK-6JIt3Ws';
const TAB_NAME = 'boards';

function boardsSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName(TAB_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(TAB_NAME);
    sheet.appendRow(['id', 'board', 'updated']);
  }
  return sheet;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const id = e && e.parameter ? e.parameter.id : '';
  if (!id) return json_({ error: 'missing id' });

  const rows = boardsSheet_().getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) return json_(JSON.parse(rows[i][1]));
  }
  return json_(null); // no card stored for this id yet
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // serialize writes so two players can't interleave
  try {
    const payload = JSON.parse(e.postData.contents);
    if (!payload || !payload.id || !payload.board) return json_({ error: 'missing id or board' });

    const sheet = boardsSheet_();
    const rows = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === payload.id) { rowIndex = i; break; }
    }

    const serialized = JSON.stringify(payload.board);
    const now = new Date();
    if (rowIndex === -1) {
      sheet.appendRow([payload.id, serialized, now]);
    } else {
      sheet.getRange(rowIndex + 1, 2, 1, 2).setValues([[serialized, now]]);
    }
    return json_({ ok: true });
  } catch (error) {
    return json_({ error: String(error) });
  } finally {
    lock.releaseLock();
  }
}
