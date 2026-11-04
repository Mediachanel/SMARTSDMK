// Add as a NEW Apps Script file. Existing onOpen/updatePetaJabatan stay untouched.
const PETA_SISTEM_V2 = {
  url: 'https://smart.sdmk.org/api/peta-jabatan/export',
  stateKey: 'PETA_SISTEM_V2_JOB',
  ownerKey: 'PETA_SISTEM_V2_OWNER',
};

function pasangMenuPetaSistem() {
  SpreadsheetApp.getUi().createMenu('Peta Sistem')
    .addItem('Update bagan dan matriks', 'updatePetaSistem')
    .addItem('Lanjutkan update', 'lanjutkanPetaSistem')
    .addItem('Pasang update jam 12 WIB', 'pasangJadwalPetaSistem')
    .addToUi();
}

function pasangPetaSistem() {
  if (typeof Sheets === 'undefined') throw new Error('Aktifkan Google Sheets API di Apps Script > Services terlebih dahulu.');
  const spreadsheet = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty('PETA_SISTEM_V2_SPREADSHEET', spreadsheet.getId());
  ScriptApp.getProjectTriggers().filter((item) => item.getHandlerFunction() === 'pasangMenuPetaSistem').forEach((item) => ScriptApp.deleteTrigger(item));
  ScriptApp.newTrigger('pasangMenuPetaSistem').forSpreadsheet(spreadsheet).onOpen().create();
  pasangMenuPetaSistem();
}

function pasangJadwalPetaSistem() {
  ScriptApp.getProjectTriggers().filter((item) => item.getHandlerFunction() === 'updatePetaSistem').forEach((item) => ScriptApp.deleteTrigger(item));
  ScriptApp.newTrigger('updatePetaSistem').timeBased().everyDays(1).atHour(12).inTimezone('Asia/Jakarta').create();
  SpreadsheetApp.getActive().toast('Update sekitar jam 12 WIB dipasang. Sumber harus diekspor ulang di server agar datanya terbaru.');
}

function updatePetaSistem() { petaSistemRun_(true); }
function lanjutkanPetaSistem() { petaSistemRun_(false); }

function petaSistemFetch_(key) {
  if (!/^peta-layout-v2(?:-[a-z0-9-]+)?$/.test(key)) throw new Error('Nama file layout tidak valid.');
  const token = PropertiesService.getScriptProperties().getProperty('PETA_JABATAN_EXPORT_TOKEN') || '';
  const response = UrlFetchApp.fetch(`${PETA_SISTEM_V2.url}?file=${encodeURIComponent(key)}`, {
    headers: { 'x-export-token': token }, muteHttpExceptions: true, followRedirects: true,
  });
  const code = response.getResponseCode();
  if (code === 401) throw new Error('Token export tidak valid. Periksa Script Property PETA_JABATAN_EXPORT_TOKEN.');
  if (code === 404) throw new Error('Layout sistem belum tersedia. Jalankan exporter baru export-system.mjs terlebih dahulu.');
  if (code < 200 || code >= 300) throw new Error(`Gagal membaca layout sistem (HTTP ${code}).`);
  try { return JSON.parse(response.getContentText('UTF-8')); }
  catch (_) { throw new Error('File layout bukan JSON v2. CSV lama tidak dapat dipakai sebagai bagan sistem.'); }
}

function petaSistemSave_(state) {
  PropertiesService.getScriptProperties().setProperty(PETA_SISTEM_V2.stateKey, JSON.stringify(state));
}

function petaSistemTrigger_(enabled) {
  const triggers = ScriptApp.getProjectTriggers().filter((item) => item.getHandlerFunction() === 'lanjutkanPetaSistem');
  if (!enabled) triggers.forEach((item) => ScriptApp.deleteTrigger(item));
  else if (!triggers.length) ScriptApp.newTrigger('lanjutkanPetaSistem').timeBased().everyMinutes(1).create();
}

function petaSistemRequests_(requests, targetId) {
  const allowed = new Set(['updateCells', 'mergeCells', 'unmergeCells', 'updateDimensionProperties']);
  return requests.map((request) => {
    const keys = Object.keys(request);
    if (keys.length !== 1 || !allowed.has(keys[0])) throw new Error('Operasi layout tidak didukung.');
    return JSON.parse(JSON.stringify(request), (key, value) => {
      if (key === 'formulaValue') throw new Error('Formula tidak diperbolehkan dalam layout.');
      if (key === 'sheetId') {
        if (value !== 0) throw new Error('Layout memiliki sheetId sumber yang tidak valid.');
        return targetId;
      }
      return value;
    });
  });
}

function petaSistemOwned_(sheet, name) {
  return sheet.getDeveloperMetadata().some((item) => item.getKey() === PETA_SISTEM_V2.ownerKey && item.getValue() === name);
}

function petaSistemCommit_(spreadsheet, state, layout) {
  const stage = spreadsheet.getSheetById(state.stageId);
  if (!stage || !petaSistemOwned_(stage, layout.name)) throw new Error('Sheet penampung tidak ditemukan atau bukan milik proses ini.');
  const target = spreadsheet.getSheetByName(layout.name);
  if (!target) { stage.setName(layout.name); return; }
  if (target.getSheetId() === stage.getSheetId()) return;
  if (!petaSistemOwned_(target, layout.name)) throw new Error(`Sheet "${layout.name}" sudah ada dan bukan hasil integrasi v2. Ubah nama sheet tersebut dahulu.`);
  const targetId = target.getSheetId();
  const grid = { ...layout.grid, rowCount: Math.max(layout.grid.rowCount, target.getMaxRows()), columnCount: Math.max(layout.grid.columnCount, target.getMaxColumns()) };
  const range = { sheetId: targetId, startRowIndex: 0, startColumnIndex: 0, endRowIndex: grid.rowCount, endColumnIndex: grid.columnCount };
  // One atomic commit preserves the target gid; the previous display survives a failed batch.
  Sheets.Spreadsheets.batchUpdate({ requests: [
    { updateSheetProperties: { properties: { sheetId: targetId, gridProperties: grid }, fields: 'gridProperties' } },
    { unmergeCells: { range } },
    { updateCells: { range, fields: 'userEnteredValue,userEnteredFormat' } },
    { copyPaste: { source: { sheetId: state.stageId, startRowIndex: 0, startColumnIndex: 0, endRowIndex: layout.grid.rowCount, endColumnIndex: layout.grid.columnCount }, destination: { sheetId: targetId, startRowIndex: 0, startColumnIndex: 0, endRowIndex: layout.grid.rowCount, endColumnIndex: layout.grid.columnCount }, pasteType: 'PASTE_NORMAL' } },
    ...petaSistemRequests_(layout.dimensions, targetId),
  ] }, spreadsheet.getId());
  // Deleting the staging tab is deferred until the cursor is safely advanced.
}

function petaSistemRun_(startNew) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const started = Date.now();
  const properties = PropertiesService.getScriptProperties();
  let spreadsheet;
  try {
    if (typeof Sheets === 'undefined') throw new Error('Aktifkan Google Sheets API di Apps Script > Services terlebih dahulu.');
    let state = JSON.parse(properties.getProperty(PETA_SISTEM_V2.stateKey) || 'null');
    if (!state) {
      if (!startNew) { petaSistemTrigger_(false); return; }
      const manifest = petaSistemFetch_('peta-layout-v2');
      if (manifest.schema !== 'peta-layout-v2' || !manifest.sheets.length || !/^[a-z0-9-]+$/.test(manifest.generation)) throw new Error('Manifest layout sistem tidak valid.');
      const spreadsheetId = properties.getProperty('PETA_SISTEM_V2_SPREADSHEET') || SpreadsheetApp.getActive().getId();
      state = { spreadsheetId, generation: manifest.generation, sheetIndex: 0, chunkIndex: 0, stageId: null };
      petaSistemSave_(state);
    }
    spreadsheet = SpreadsheetApp.openById(state.spreadsheetId);
    const manifest = petaSistemFetch_(`peta-layout-v2-${state.generation}-manifest`);
    if (manifest.schema !== 'peta-layout-v2' || manifest.generation !== state.generation) throw new Error('Generasi manifest berubah.');
    petaSistemTrigger_(true);
    while (state.sheetIndex < manifest.sheets.length && Date.now() - started < 150000) {
      const entry = manifest.sheets[state.sheetIndex];
      const layout = petaSistemFetch_(entry.file);
      if (layout.schema !== 'peta-layout-v2-sheet' || layout.generation !== state.generation || layout.name !== entry.name) throw new Error('Identitas layout tidak cocok dengan manifest.');
      if (!state.stageId) {
        const stageName = `_PETA_V2_${state.generation}_${state.sheetIndex}`;
        let stage = spreadsheet.getSheetByName(stageName);
        if (!stage) {
          const result = Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { title: stageName, gridProperties: layout.grid } } }] }, spreadsheet.getId());
          stage = spreadsheet.getSheetById(result.replies[0].addSheet.properties.sheetId);
        }
        if (!petaSistemOwned_(stage, layout.name)) stage.addDeveloperMetadata(PETA_SISTEM_V2.ownerKey, layout.name);
        state.stageId = stage.getSheetId();
        petaSistemSave_(state);
      }
      while (state.chunkIndex < layout.chunks.length && Date.now() - started < 150000) {
        const chunk = petaSistemFetch_(layout.chunks[state.chunkIndex]);
        if (chunk.schema !== 'peta-layout-v2-chunk' || chunk.generation !== state.generation) throw new Error('Generasi chunk tidak cocok.');
        Sheets.Spreadsheets.batchUpdate({ requests: petaSistemRequests_(chunk.requests, state.stageId) }, spreadsheet.getId());
        state.chunkIndex += 1;
        petaSistemSave_(state);
        Utilities.sleep(1200);
      }
      if (state.chunkIndex < layout.chunks.length || Date.now() - started >= 150000) break;
      const previousStageId = state.stageId;
      petaSistemCommit_(spreadsheet, state, layout);
      state.sheetIndex += 1;
      state.chunkIndex = 0;
      state.stageId = null;
      petaSistemSave_(state);
      const previousStage = spreadsheet.getSheetById(previousStageId);
      if (previousStage && previousStage.getName().startsWith('_PETA_V2_')) spreadsheet.deleteSheet(previousStage);
      spreadsheet.toast(`${state.sheetIndex}/${manifest.sheets.length}: ${layout.name}`);
    }
    if (state.sheetIndex === manifest.sheets.length) {
      properties.deleteProperty(PETA_SISTEM_V2.stateKey);
      petaSistemTrigger_(false);
      properties.setProperty('PETA_SISTEM_V2_LAST_SUCCESS', JSON.stringify({ sourceUpdatedAt: manifest.updated_at, importedAt: new Date().toISOString(), sheets: manifest.sheets.length }));
      spreadsheet.toast(`Selesai: ${manifest.sheets.length} bagan/matriks. Data sumber: ${manifest.updated_at}`);
    } else spreadsheet.toast(`Diproses ${state.sheetIndex}/${manifest.sheets.length} sheet. Akan dilanjutkan otomatis.`);
  } catch (error) {
    petaSistemTrigger_(false);
    if (spreadsheet) spreadsheet.toast(`Update berhenti: ${error.message}. Pilih Lanjutkan update setelah masalah diperbaiki.`);
    throw error;
  } finally { lock.releaseLock(); }
}
