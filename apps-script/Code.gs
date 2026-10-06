/**
 * Trip Money — Google Apps Script backend
 * วางโค้ดนี้ใน Extensions > Apps Script ของ Google Sheet แล้ว Deploy เป็น Web app
 */

// ตั้งรหัสสำหรับแก้ไขข้อมูล (เว้นว่าง = ใครมีลิงก์ก็แก้ได้)
const EDIT_KEY = '';

const SCHEMA = {
  members: ['id', 'name', 'due', 'paid', 'note', 'updatedAt'],
  expenses: ['id', 'title', 'category', 'amount', 'date', 'note', 'updatedAt'],
  settings: ['key', 'value'],
};

const NUMBER_FIELDS = ['due', 'paid', 'amount'];

function doGet() {
  return json({ ok: true, data: readAll() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const req = JSON.parse(e.postData.contents);
    if (EDIT_KEY && req.key !== EDIT_KEY) {
      return json({ ok: false, error: 'รหัสแก้ไขไม่ถูกต้อง' });
    }
    switch (req.action) {
      case 'upsert':
        upsertRow(req.sheet, req.row);
        break;
      case 'delete':
        deleteRow(req.sheet, req.id);
        break;
      case 'setting':
        upsertSetting(req.key_name, req.value);
        break;
      case 'ping':
        break;
      default:
        throw new Error('Unknown action: ' + req.action);
    }
    return json({ ok: true, data: readAll() });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- helpers ---------- */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  if (!SCHEMA[name]) throw new Error('Unknown sheet: ' + name);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SCHEMA[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, SCHEMA[name].length).setFontWeight('bold');
  }
  return sh;
}

function readSheet(name) {
  const sh = getSheet(name);
  const values = sh.getDataRange().getValues();
  const header = values.shift() || SCHEMA[name];
  return values
    .filter((r) => r.some((c) => c !== ''))
    .map((r) => {
      const o = {};
      header.forEach((h, i) => {
        let v = r[i];
        if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        if (NUMBER_FIELDS.indexOf(h) >= 0) v = Number(v) || 0;
        o[h] = v;
      });
      return o;
    });
}

function readAll() {
  const settings = {};
  readSheet('settings').forEach((s) => (settings[s.key] = s.value));
  return {
    members: readSheet('members'),
    expenses: readSheet('expenses'),
    settings: settings,
  };
}

function findRowIndex(sh, id) {
  const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (let i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 1; // 1-based sheet row
  }
  return -1;
}

function upsertRow(name, row) {
  if (!row || !row.id) throw new Error('row.id is required');
  const sh = getSheet(name);
  row.updatedAt = new Date().toISOString();
  const values = SCHEMA[name].map((h) => (row[h] === undefined ? '' : row[h]));
  const idx = findRowIndex(sh, row.id);
  if (idx > 0) {
    sh.getRange(idx, 1, 1, values.length).setValues([values]);
  } else {
    sh.appendRow(values);
  }
}

function deleteRow(name, id) {
  const sh = getSheet(name);
  const idx = findRowIndex(sh, id);
  if (idx > 0) sh.deleteRow(idx);
}

function upsertSetting(key, value) {
  const sh = getSheet('settings');
  const idx = findRowIndex(sh, key);
  if (idx > 0) sh.getRange(idx, 2).setValue(value);
  else sh.appendRow([key, value]);
}

/** รันฟังก์ชันนี้ 1 ครั้งใน editor เพื่อสร้างชีตและขอสิทธิ์ */
function setup() {
  Object.keys(SCHEMA).forEach(getSheet);
}
