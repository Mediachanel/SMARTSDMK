import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ExcelJS from 'exceljs';
import { worksheetLayout, requestChunks } from './sheets-layout.mjs';
import { matrixWorksheet } from './capture-matrix.mjs';

test('bagan retains geometry, labels, negative metrics, and connector-only cells', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Bagan Peta Jabatan');
  for (let column = 1; column <= 40; column += 1) sheet.getColumn(column).width = 1.15;
  for (let row = 1; row <= 12; row += 1) sheet.getRow(row).height = 8.25;
  sheet.mergeCells('B2:O3');
  sheet.getCell('B2').value = 'Non-ASN (PPPK Paruh Waktu dan Non PNS/ASN)';
  sheet.getCell('B2').font = { name: 'Arial', size: 8, bold: true };
  sheet.getCell('B2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CEE3' } };
  sheet.getCell('B5').value = -13;
  sheet.getCell('H8').border = { left: { style: 'thin', color: { argb: 'FF334155' } } };
  // Exercise the actual XLSX round trip used by the existing system exporter.
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const layout = worksheetLayout(restored.worksheets[0], { diagram: true });
  assert.equal(layout.grid.columnCount, 40);
  assert.equal(layout.grid.rowCount, 12);
  assert.equal(layout.dimensions[0].updateDimensionProperties.properties.pixelSize, 8);
  assert.equal(layout.dimensions[1].updateDimensionProperties.properties.pixelSize, 11);
  const writes = layout.requests.filter((request) => request.updateCells).map((request) => request.updateCells);
  const values = writes.flatMap((request) => request.rows.flatMap((row) => row.values)).filter((cell) => cell.userEnteredValue);
  assert.deepEqual(values.map((cell) => cell.userEnteredValue), [
    { stringValue: 'Non-ASN (PPPK Paruh Waktu dan Non PNS/ASN)' }, { numberValue: -13 },
  ]);
  assert.ok(writes.some((request) => request.start.rowIndex === 7 && request.start.columnIndex === 7 && request.rows[0].values[0].userEnteredFormat.borders.left.style === 'SOLID'));
  assert.deepEqual(layout.requests.at(-1).mergeCells.range, { sheetId: 0, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 15 });
});

test('matrix preserves two-level headers, metric values, and frozen identity columns', () => {
  const workbook = new ExcelJS.Workbook();
  const snapshot = {
    widths: [48, 208, 64, 208, 64, 208, 208, 56, 56, 56], heights: [44, 28, 32],
    cells: [
      { row: 1, column: 1, rowSpan: 2, colSpan: 1, value: 'No.' },
      { row: 1, column: 8, rowSpan: 1, colSpan: 3, value: 'RSUD B\nNON-ASN' },
      { row: 2, column: 8, rowSpan: 1, colSpan: 1, value: 'B' },
      { row: 3, column: 8, rowSpan: 1, colSpan: 1, value: 1234 },
      { row: 3, column: 10, rowSpan: 1, colSpan: 1, value: -200 },
    ],
  };
  const layout = worksheetLayout(matrixWorksheet(workbook, snapshot));
  assert.equal(layout.grid.frozenRowCount, 2);
  assert.equal(layout.grid.frozenColumnCount, 7);
  assert.equal(layout.requests.filter((request) => request.mergeCells).length, 2);
  assert.ok(JSON.stringify(layout.requests).includes('"numberValue":1234'));
  assert.ok(JSON.stringify(layout.requests).includes('"numberValue":-200'));
});

test('chunk boundaries do not split idempotent merge pairs', () => {
  const range = { sheetId: 0, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 4 };
  const requests = [{ updateCells: {} }, { unmergeCells: { range } }, { mergeCells: { range, mergeType: 'MERGE_ALL' } }];
  const chunks = requestChunks(requests, 10000, 2);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [1, 2]);
  assert.deepEqual(chunks.flat(), requests);
});

test('external values beginning with = remain literal and formula objects are rejected', () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Bagan');
  sheet.getCell('A1').value = '=IMPORTDATA("https://example.invalid")';
  assert.equal(worksheetLayout(sheet, { diagram: true }).requests.find((item) => item.updateCells).updateCells.rows[0].values[0].userEnteredValue.stringValue, sheet.getCell('A1').value);
  sheet.getCell('A1').value = { formula: '1+1', result: 2 };
  assert.throws(() => worksheetLayout(sheet), /bukan formula/);
});

const appsScript = await readFile(new URL('./google-sheets-peta-sistem.js', import.meta.url), 'utf8');

test('new Apps Script has no old menu/update handlers and restricts writes to staging id', () => {
  const context = vm.createContext({});
  vm.runInContext(appsScript, context);
  assert.equal(typeof context.onOpen, 'undefined');
  assert.equal(typeof context.updatePetaJabatan, 'undefined');
  const rewritten = context.petaSistemRequests_([{ mergeCells: { range: { sheetId: 0 } } }], 123);
  assert.equal(rewritten[0].mergeCells.range.sheetId, 123);
  assert.throws(() => context.petaSistemRequests_([{ deleteSheet: { sheetId: 0 } }], 123), /tidak didukung/);
  assert.throws(() => context.petaSistemRequests_([{ updateCells: { start: { sheetId: 99 } } }], 123), /tidak valid/);
  assert.throws(() => context.petaSistemRequests_([{ updateCells: { rows: [{ values: [{ userEnteredValue: { formulaValue: '=1+1' } }] }] } }], 123), /Formula/);
});

test('commit keeps previous target gid and copies geometry in the same atomic batch', () => {
  const metadata = { getKey: () => 'PETA_SISTEM_V2_OWNER', getValue: () => 'PETA ASN - RSUD B' };
  const stage = { getDeveloperMetadata: () => [metadata], getSheetId: () => 123 };
  const target = { getDeveloperMetadata: () => [metadata], getSheetId: () => 456, getMaxRows: () => 200, getMaxColumns: () => 100 };
  const calls = [];
  const context = vm.createContext({ Sheets: { Spreadsheets: { batchUpdate: (body, id) => calls.push({ body, id }) } } });
  vm.runInContext(appsScript, context);
  const spreadsheet = { getSheetById: () => stage, getSheetByName: () => target, getId: () => 'spreadsheet' };
  context.petaSistemCommit_(spreadsheet, { stageId: 123 }, { name: 'PETA ASN - RSUD B', grid: { rowCount: 100, columnCount: 60 }, dimensions: [{ updateDimensionProperties: { range: { sheetId: 0 }, properties: { pixelSize: 8 } } }] });
  assert.equal(calls.length, 1);
  const requests = calls[0].body.requests;
  assert.equal(requests[3].copyPaste.destination.sheetId, 456);
  assert.equal(requests[4].updateDimensionProperties.range.sheetId, 456);
  assert.equal(requests.some((request) => request.deleteSheet), false);
  target.getDeveloperMetadata = () => [];
  assert.throws(() => context.petaSistemCommit_(spreadsheet, { stageId: 123 }, { name: 'PETA ASN - RSUD B' }), /bukan hasil integrasi/);
});

test('paused update resumes the same generation and publishes only after all chunks', () => {
  const properties = new Map([['PETA_SISTEM_V2_SPREADSHEET', 'book']]);
  const tabs = new Map();
  const triggers = [];
  let time = 0;
  let pause = true;
  let currentGeneration = '111-old';
  const writes = [];
  const files = {
    'peta-layout-v2-111-old-manifest': { schema: 'peta-layout-v2', generation: '111-old', updated_at: '2026-09-23', sheets: [{ name: 'PETA NON ASN - RSUD B', file: 'peta-layout-v2-111-old-0' }] },
    'peta-layout-v2-111-old-0': { schema: 'peta-layout-v2-sheet', generation: '111-old', name: 'PETA NON ASN - RSUD B', grid: { rowCount: 30, columnCount: 50 }, dimensions: [], chunks: ['peta-layout-v2-111-old-0-part-0', 'peta-layout-v2-111-old-0-part-1'] },
    'peta-layout-v2-111-old-0-part-0': { schema: 'peta-layout-v2-chunk', generation: '111-old', requests: [{ updateCells: { start: { sheetId: 0 }, rows: [] } }] },
    'peta-layout-v2-111-old-0-part-1': { schema: 'peta-layout-v2-chunk', generation: '111-old', requests: [{ mergeCells: { range: { sheetId: 0 }, mergeType: 'MERGE_ALL' } }] },
  };
  const spreadsheet = {
    getId: () => 'book', getSheetById: (id) => tabs.get(id),
    getSheetByName: (name) => [...tabs.values()].find((sheet) => sheet.getName() === name), toast() {},
  };
  const context = vm.createContext({
    Date: class extends Date { static now() { return time; } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) || null, setProperty: (key, value) => properties.set(key, value), deleteProperty: (key) => properties.delete(key) }) },
    SpreadsheetApp: { openById: () => spreadsheet },
    Utilities: { sleep: () => { if (pause) time += 150000; } },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      deleteTrigger: (trigger) => triggers.splice(triggers.indexOf(trigger), 1),
      newTrigger: (handler) => ({ timeBased() { return this; }, everyMinutes() { return this; }, create() { triggers.push({ getHandlerFunction: () => handler }); } }),
    },
    UrlFetchApp: { fetch: (url, options) => {
      assert.equal(new URL(url).searchParams.has('token'), false);
      assert.ok('x-export-token' in options.headers);
      const key = new URL(url).searchParams.get('file');
      const value = key === 'peta-layout-v2' ? files[`peta-layout-v2-${currentGeneration}-manifest`] : files[key];
      assert.ok(value, `Unexpected generation read: ${key}`);
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(value) };
    } },
    Sheets: { Spreadsheets: { batchUpdate: ({ requests }) => {
      if (requests[0].addSheet) {
        let name = requests[0].addSheet.properties.title;
        const metadata = [];
        tabs.set(123, { getSheetId: () => 123, getName: () => name, setName: (value) => { name = value; }, getDeveloperMetadata: () => metadata, addDeveloperMetadata: (key, value) => metadata.push({ getKey: () => key, getValue: () => value }) });
        return { replies: [{ addSheet: { properties: { sheetId: 123 } } }] };
      }
      writes.push(requests);
      return {};
    } } },
  });
  vm.runInContext(appsScript, context);
  context.updatePetaSistem();
  const paused = JSON.parse(properties.get('PETA_SISTEM_V2_JOB'));
  assert.equal(paused.sheetIndex, 0);
  assert.equal(paused.chunkIndex, 1);
  assert.equal(paused.generation, '111-old');
  assert.equal(spreadsheet.getSheetByName('PETA NON ASN - RSUD B'), undefined);
  assert.equal(triggers.length, 1);
  currentGeneration = '222-new';
  pause = false;
  context.lanjutkanPetaSistem();
  assert.equal(writes.length, 2);
  assert.equal(writes[0][0].updateCells.start.sheetId, 123);
  assert.equal(writes[1][0].mergeCells.range.sheetId, 123);
  assert.ok(spreadsheet.getSheetByName('PETA NON ASN - RSUD B'));
  assert.equal(properties.has('PETA_SISTEM_V2_JOB'), false);
  assert.equal(triggers.length, 0);
});
