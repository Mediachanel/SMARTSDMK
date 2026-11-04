const BASE_URL = 'https://smart.sdmk.org/api/peta-jabatan/export';
const EXPORT_TOKEN = '';
const EXPORT_TOKEN_PROPERTY = 'PETA_JABATAN_EXPORT_TOKEN';
const DEFAULT_SHEETS = [
  { name: 'Ringkasan DB', file: 'ringkasan.csv' },
  { name: 'rekap', file: 'rekap.csv' },
  { name: 'Rekap all', file: 'rekap-all.csv' },
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Update Data')
    .addItem('Update sekarang', 'updatePetaJabatan')
    .addItem('Update sheet aktif', 'updateActivePetaJabatanSheet')
    .addItem('Lanjutkan update batch', 'resumePetaJabatanUpdate')
    .addSeparator()
    .addItem('Pasang trigger jam 12', 'installNoonTrigger')
    .addToUi();
}

function installNoonTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'updatePetaJabatan')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('updatePetaJabatan')
    .timeBased()
    .everyDays(1)
    .atHour(12)
    .create();

  SpreadsheetApp.getActive().toast('Trigger update harian jam 12 sudah dipasang.');
}

function updatePetaJabatan() {
  const manifest = JSON.parse(fetchText_(exportUrl_('manifest')));
  const sheets = sortSheetsForUpdate_(Array.isArray(manifest.sheets) && manifest.sheets.length
    ? manifest.sheets
    : DEFAULT_SHEETS);
  PropertiesService.getScriptProperties().deleteProperty('PETA_JABATAN_UPDATE_CURSOR');
  updateSheets_(manifest, sheets, 0);
}

function resumePetaJabatanUpdate() {
  const manifest = JSON.parse(fetchText_(exportUrl_('manifest')));
  const sheets = sortSheetsForUpdate_(Array.isArray(manifest.sheets) && manifest.sheets.length
    ? manifest.sheets
    : DEFAULT_SHEETS);
  const startIndex = Number(PropertiesService.getScriptProperties().getProperty('PETA_JABATAN_UPDATE_CURSOR') || 0);
  updateSheets_(manifest, sheets, startIndex);
}

function updateActivePetaJabatanSheet() {
  const spreadsheet = SpreadsheetApp.getActive();
  const activeName = spreadsheet.getActiveSheet().getName();
  const manifest = JSON.parse(fetchText_(exportUrl_('manifest')));
  const sheets = sortSheetsForUpdate_(Array.isArray(manifest.sheets) && manifest.sheets.length
    ? manifest.sheets
    : DEFAULT_SHEETS);
  const target = sheets.find((sheet) => sheet.name === activeName);
  if (!target) throw new Error(`Sheet aktif "${activeName}" tidak ada di manifest export.`);
  importCsvToSheet_(target.name, exportUrl_(normalizeFileKey_(target.file)));
  writeUpdateInfo_(manifest, 1);
  spreadsheet.toast(`Sheet ${activeName} berhasil diperbarui.`);
}

function updateSheets_(manifest, sheets, startIndex) {
  const startedAt = Date.now();
  const maxRuntimeMs = 270000;
  const properties = PropertiesService.getScriptProperties();
  const spreadsheet = SpreadsheetApp.getActive();

  for (let index = startIndex; index < sheets.length; index += 1) {
    const sheet = sheets[index];
    spreadsheet.toast(`Update ${index + 1}/${sheets.length}: ${sheet.name}`);
    importCsvToSheet_(sheet.name, exportUrl_(normalizeFileKey_(sheet.file)));
    SpreadsheetApp.flush();
    properties.setProperty('PETA_JABATAN_UPDATE_CURSOR', String(index + 1));
    if (Date.now() - startedAt > maxRuntimeMs) {
      writeUpdateInfo_(manifest, index + 1);
      spreadsheet.toast(`Update dijeda di ${index + 1}/${sheets.length}. Jalankan "Lanjutkan update batch".`);
      return;
    }
  }

  properties.deleteProperty('PETA_JABATAN_UPDATE_CURSOR');
  writeUpdateInfo_(manifest, sheets.length);
  spreadsheet.toast(`Data peta jabatan berhasil diperbarui: ${sheets.length} sheet.`);
}

function sortSheetsForUpdate_(sheets) {
  return sheets.slice().sort((first, second) => sheetPriority_(first.name) - sheetPriority_(second.name));
}

function sheetPriority_(name) {
  const title = String(name || '').trim().toUpperCase();
  if (['RINGKASAN DB', 'REKAP', 'REKAP ALL'].includes(title)) return 0;
  if (title.startsWith('PETA ')) return 1;
  return 2;
}

function exportUrl_(file) {
  const exportToken = getExportToken_();
  const token = exportToken ? `&token=${encodeURIComponent(exportToken)}` : '';
  return `${BASE_URL}?file=${encodeURIComponent(file)}${token}`;
}

function getExportToken_() {
  return EXPORT_TOKEN || PropertiesService.getScriptProperties().getProperty(EXPORT_TOKEN_PROPERTY) || '';
}

function normalizeFileKey_(file) {
  return String(file || '').replace(/\.csv$/i, '');
}

function importCsvToSheet_(sheetName, url) {
  const values = normalizeCsvRows_(Utilities.parseCsv(fetchText_(url)));
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  resetSheet_(sheet);

  if (!values.length || !values[0].length) {
    sheet.getRange(1, 1).setValue('Tidak ada data');
    return;
  }

  if (isPetaSheet_(sheetName)) {
    try {
      renderPetaChart_(sheet, sheetName, values);
    } catch (reason) {
      throw new Error(`Gagal membuat bagan ${sheetName}: ${reason.message || reason}`);
    }
    return;
  }

  ensureSheetSize_(sheet, values.length, values[0].length);
  const range = sheet.getRange(1, 1, values.length, values[0].length);
  range.setNumberFormat('@');
  range.setValues(values);
  formatTableSheet_(sheet, values);
}

function resetSheet_(sheet) {
  if (sheet.getFilter()) sheet.getFilter().remove();
  const fullRange = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns());
  fullRange.breakApart();
  fullRange.clear();
}

function ensureSheetSize_(sheet, rows, columns) {
  if (sheet.getMaxRows() < rows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < columns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  }
}

function normalizeCsvRows_(values) {
  const width = Math.max(1, ...values.map((row) => row.length));
  return values.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push('');
    return next;
  });
}

function writeUpdateInfo_(manifest, sheetCount) {
  const spreadsheet = SpreadsheetApp.getActive();
  const sheet = spreadsheet.getSheetByName('INFO UPDATE') || spreadsheet.insertSheet('INFO UPDATE', 0);
  sheet.clear();
  sheet.getRange(1, 1, 5, 2).setValues([
    ['Status', manifest.status || 'ok'],
    ['Update server', manifest.updated_at || ''],
    ['Update spreadsheet', new Date()],
    ['Jumlah sheet', sheetCount],
    ['Sumber', BASE_URL],
  ]);
  sheet.getRange(1, 1, 5, 1).setFontWeight('bold').setBackground('#E0F2FE');
  sheet.autoResizeColumns(1, 2);
}

function formatTableSheet_(sheet, values) {
  const headerRow = values.length > 1 && values[0].filter((cell) => String(cell || '').trim()).length === 1 ? 2 : 1;
  if (headerRow === 2) {
    ensureSheetSize_(sheet, values.length, values[0].length);
    sheet.getRange(1, 1, 1, values[0].length)
      .mergeAcross()
      .setFontWeight('bold')
      .setFontSize(12)
      .setHorizontalAlignment('center')
      .setBackground('#D9EAF7');
  }
  sheet.setFrozenRows(headerRow);
  sheet.getRange(headerRow, 1, 1, values[0].length)
    .setFontWeight('bold')
    .setBackground('#0A477F')
    .setFontColor('#FFFFFF')
    .setWrap(true);
  sheet.getRange(headerRow, 1, Math.max(values.length - headerRow + 1, 1), values[0].length).createFilter();
  sheet.autoResizeColumns(1, Math.min(values[0].length, 20));
}

function isPetaSheet_(sheetName) {
  return String(sheetName || '').trim().toUpperCase().startsWith('PETA ');
}

function renderPetaChart_(sheet, sheetName, values) {
  const headerIndex = values.findIndex((row) => String(row[0] || '').trim().toUpperCase() === 'LEVEL');
  if (headerIndex < 0) {
    const range = sheet.getRange(1, 1, values.length, values[0].length);
    range.setNumberFormat('@');
    range.setValues(values);
    formatTableSheet_(sheet, values);
    return;
  }

  const headers = values[headerIndex].map((item) => String(item || '').trim());
  const rows = values.slice(headerIndex + 1).filter((row) => String(row[1] || '').trim());
  const indexOf = (name) => headers.findIndex((header) => header.toUpperCase() === name);
  const levelIndex = indexOf('LEVEL');
  const titleIndex = indexOf('BAGAN JABATAN');
  const classIndex = indexOf('KELAS');
  const bossIndex = indexOf('ATASAN LANGSUNG');
  const familyIndex = indexOf('RUMPUN JABATAN');
  const bIndex = indexOf('B PNS');
  const kIndex = indexOf('K PNS');
  const sIndex = indexOf('S PNS');
  const unitIndex = indexOf('UNIT KERJA');
  const typeIndex = indexOf('JENIS PETA');
  const metric = (row) => `(${String(row[classIndex] || '-').trim()}-${String(row[bIndex] || '0').trim()}-${String(row[kIndex] || '0').trim()}-${String(row[sIndex] || '0').trim()})`;
  const cleanTitle = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const normalized = rows.map((row, index) => ({
    index,
    row,
    level: Math.max(1, Math.min(8, Number(row[levelIndex]) || 1)),
    title: cleanTitle(row[titleIndex]),
    boss: cleanTitle(row[bossIndex]),
    className: String(row[classIndex] || '').trim() || '-',
    b: String(row[bIndex] || '0').trim(),
    k: String(row[kIndex] || '0').trim(),
    s: String(row[sIndex] || '0').trim(),
    family: cleanTitle(row[familyIndex]),
    unit: cleanTitle(row[unitIndex]),
    type: cleanTitle(row[typeIndex]),
  }));

  const byTitle = new Map();
  normalized.forEach((item) => {
    const key = item.title.toUpperCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(item);
  });
  const keyText = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const bossMatches = (manager, item) => {
    const managerTitle = keyText(manager.title);
    const bossTitle = keyText(item.boss);
    if (!managerTitle || !bossTitle || manager.index === item.index) return false;
    return managerTitle === bossTitle || managerTitle.includes(bossTitle) || bossTitle.includes(managerTitle);
  };
  const isStructural = (item) => /PIMPINAN TINGGI|ADMINISTRATOR|PENGAWAS/.test(String(item.family || '').toUpperCase())
    || normalized.some((candidate) => bossMatches(item, candidate));
  const roots = normalized.filter((item) => !item.boss || !normalized.some((candidate) => bossMatches(candidate, item)));
  const topChain = [];
  let current = roots[0] || normalized[0];
  const seen = new Set();
  while (current && !seen.has(current.index)) {
    topChain.push(current);
    seen.add(current.index);
    const children = normalized.filter((item) => bossMatches(current, item) && isStructural(item));
    if (children.length !== 1) break;
    current = children[0];
  }

  const chainKeys = new Set(topChain.map((item) => item.index));
  let groups = normalized.filter((item) => !chainKeys.has(item.index) && isStructural(item));
  if (!groups.length) groups = normalized.filter((item) => !chainKeys.has(item.index)).slice(0, 8);
  const groupChildren = (group) => normalized.filter((item) => bossMatches(group, item) && item.index !== group.index && !groups.some((other) => other.index === item.index));

  const groupWidth = 5;
  const gap = 1;
  const groupsPerBand = Math.min(6, Math.max(1, groups.length || 1));
  const totalColumns = Math.max(12, groupsPerBand * groupWidth + (groupsPerBand - 1) * gap);
  const output = [
    padRow([sheetName], totalColumns),
    padRow(['DINAS KESEHATAN PROVINSI DKI JAKARTA'], totalColumns),
  ];
  const merges = [
    { row: 1, start: 1, end: totalColumns },
    { row: 2, start: 1, end: totalColumns },
  ];
  const titleCells = [];
  const metricCells = [];
  const headerRows = [];
  const tableCells = [];

  topChain.forEach((item) => {
    output.push(padRow([], totalColumns));
    const rowNumber = output.length;
    const start = Math.max(1, Math.floor((totalColumns - groupWidth) / 2) + 1);
    const row = padRow([], totalColumns);
    row[start - 1] = item.title.toUpperCase();
    output[rowNumber - 1] = row;
    merges.push({ row: rowNumber, start, end: start + groupWidth - 1 });
    titleCells.push({ row: rowNumber, start, end: start + groupWidth - 1, root: true });

    const metricRow = padRow([], totalColumns);
    metricRow[start - 1] = metric(item);
    output.push(metricRow);
    merges.push({ row: output.length, start, end: start + groupWidth - 1 });
    metricCells.push({ row: output.length, start, end: start + groupWidth - 1 });
  });

  output.push(padRow([], totalColumns));
  for (let bandStart = 0; bandStart < groups.length; bandStart += groupsPerBand) {
    const band = groups.slice(bandStart, bandStart + groupsPerBand);
    const maxChildren = Math.max(1, ...band.map((group) => groupChildren(group).length));
    const headRowNumber = output.length + 1;
    const headRow = padRow([], totalColumns);
    const metricRow = padRow([], totalColumns);
    const tableHeader = padRow([], totalColumns);
    band.forEach((group, groupIndex) => {
      const start = groupIndex * (groupWidth + gap) + 1;
      headRow[start - 1] = group.title.toUpperCase();
      metricRow[start - 1] = metric(group);
      ['NAMA JABATAN', 'KL', 'B', 'K', 'S'].forEach((label, offset) => {
        tableHeader[start - 1 + offset] = label;
      });
      merges.push({ row: headRowNumber, start, end: start + groupWidth - 1 });
      merges.push({ row: headRowNumber + 1, start, end: start + groupWidth - 1 });
      titleCells.push({ row: headRowNumber, start, end: start + groupWidth - 1 });
      metricCells.push({ row: headRowNumber + 1, start, end: start + groupWidth - 1 });
      headerRows.push({ row: headRowNumber + 2, start, end: start + groupWidth - 1 });
    });
    output.push(headRow, metricRow, tableHeader);

    for (let childIndex = 0; childIndex < maxChildren; childIndex += 1) {
      const childRow = padRow([], totalColumns);
      band.forEach((group, groupIndex) => {
        const child = groupChildren(group)[childIndex];
        if (!child) return;
        const start = groupIndex * (groupWidth + gap) + 1;
        childRow[start - 1] = child.title;
        childRow[start] = child.className;
        childRow[start + 1] = child.b;
        childRow[start + 2] = child.k;
        childRow[start + 3] = child.s;
        tableCells.push({ row: output.length + 1, start, end: start + groupWidth - 1 });
      });
      output.push(childRow);
    }
    output.push(padRow([], totalColumns));
  }

  ensureSheetSize_(sheet, output.length, totalColumns);
  sheet.getRange(1, 1, output.length, totalColumns).setValues(output);
  merges.forEach((range) => {
    if (range.end > range.start) sheet.getRange(range.row, range.start, 1, range.end - range.start + 1).mergeAcross();
  });
  sheet.setFrozenRows(2);
  sheet.setColumnWidths(1, totalColumns, 38);
  for (let column = 1; column <= totalColumns; column += groupWidth + gap) {
    sheet.setColumnWidth(column, 230);
  }
  sheet.getRange(1, 1, output.length, totalColumns).setWrap(true).setVerticalAlignment('middle');
  sheet.getRange(1, 1, 1, totalColumns).setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center').setBackground('#0A477F').setFontColor('#FFFFFF');
  sheet.getRange(2, 1, 1, totalColumns).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#D9EAF7');
  titleCells.forEach((cell) => {
    sheet.getRange(cell.row, cell.start, 1, cell.end - cell.start + 1)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setBackground(cell.root ? '#B8CEE3' : '#D9EAF7')
      .setBorder(true, true, true, true, null, null, '#334155', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });
  metricCells.forEach((cell) => {
    sheet.getRange(cell.row, cell.start, 1, cell.end - cell.start + 1)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setBackground('#FFFFFF')
      .setBorder(true, true, true, true, null, null, '#334155', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });
  headerRows.forEach((cell) => {
    sheet.getRange(cell.row, cell.start, 1, cell.end - cell.start + 1)
      .setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setBackground('#E2E8F0')
      .setBorder(true, true, true, true, true, true, '#64748B', SpreadsheetApp.BorderStyle.SOLID);
  });
  tableCells.forEach((cell) => {
    sheet.getRange(cell.row, cell.start, 1, cell.end - cell.start + 1)
      .setBorder(true, true, true, true, true, true, '#CBD5E1', SpreadsheetApp.BorderStyle.SOLID);
  });
  if (output.length > 3) sheet.setRowHeights(3, output.length - 2, 28);
}

function padRow(row, width) {
  const next = row.slice(0, width);
  while (next.length < width) next.push('');
  return next;
}

function fetchText_(url) {
  const separator = url.indexOf('?') >= 0 ? '&' : '?';
  const response = UrlFetchApp.fetch(`${url}${separator}t=${Date.now()}`, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
  });

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    const hint = response.getResponseCode() === 401
      ? ` Pastikan Script Properties berisi ${EXPORT_TOKEN_PROPERTY} yang sama dengan token server.`
      : '';
    throw new Error(`Gagal mengambil data: HTTP ${response.getResponseCode()} - ${response.getContentText().slice(0, 200)}${hint}`);
  }

  return response.getContentText('UTF-8');
}
