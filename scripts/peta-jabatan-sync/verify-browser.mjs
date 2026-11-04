// Read-only verification using the real chart components and real Excel exporter.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { worksheetLayout } from './sheets-layout.mjs';
import { captureMatrix, matrixWorksheet } from './capture-matrix.mjs';

const repo = resolve(import.meta.dirname, '../..');
const require = createRequire(join(repo, 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transform } = require('sucrase');
const artifacts = resolve(process.env.PETA_VERIFY_OUT || '/tmp/peta-layout-verification');
const fixtures = process.env.PETA_FIXTURE_DIR;
if (!fixtures) throw new Error('Set PETA_FIXTURE_DIR to existing CSV exports; fixtures are read-only.');
await mkdir(artifacts, { recursive: true });
const source = await readFile(join(repo, 'src/app/(app)/peta-jabatan/page.jsx'), 'utf8');
const helperSource = source.slice(0, source.indexOf('export default function PetaJabatanPage()')).replace(/^import .*;\r?$/gm, '');
const componentNames = ['buildOrganizationTree', 'OrganizationNode', 'RsudABChart', 'RsudCChart', 'RsudDChart', 'PuskesmasChart', 'UptChart', 'SudinkesTree'];
const components = new Function('React', `${transform(helperSource, { transforms: ['jsx'] }).code}; return {${componentNames.join(',')}};`)(React);
const cssPath = join(artifacts, 'system.css');
execFileSync(process.execPath, [join(repo, 'node_modules/tailwindcss/lib/cli.js'), '-c', join(repo, 'tailwind.config.js'), '-i', join(repo, 'src/app/globals.css'), '-o', cssPath], { cwd: repo, stdio: 'pipe' });
const css = await readFile(cssPath, 'utf8');
const exporter = (await readFile(join(repo, 'src/lib/export/editablePetaExcel.js'), 'utf8')).replace('export function createEditablePetaWorkbook', 'window.createEditablePetaWorkbook = function');
const cases = [
  ['RSUD A', 'peta-rsud-a-kepmenpan-11.csv', 'RsudABChart'],
  ['RSUD B', 'peta-rsud-b-kepmen-11.csv', 'RsudABChart'],
  ['RSUD C', 'peta-rsud-c-kepmen-11-baru-jf.csv', 'RsudCChart'],
  ['RSUD D', 'peta-rsud-d-kepmenpan-11-bru-jf.csv', 'RsudDChart'],
  ['RSKD', 'peta-rskd-kepmenpan-11.csv', 'RsudABChart'],
  ['PUSKESMAS', 'peta-puskesmas-kepmenpan-11.csv', 'PuskesmasChart'],
  ['SUKU DINAS KOTA', 'peta-sudin-kota-kepmenpan-11.csv', 'SudinkesTree'],
  ['SUKU DINAS SERIBU', 'peta-sudin-1000-kepmenpan-11.csv', 'SudinkesTree'],
  ['DINAS KESEHATAN', 'peta-dinkes-kepmenpan-11.csv', 'OrganizationNode'],
  ...['PPKP', 'LABKESDA', 'PUSLATKESDA', 'PK3D', 'JAMKESJA', 'PUSDATIN'].map((type) => [type, 'peta-upt-kepmenpan-11.csv', 'UptChart']),
];
const browser = await chromium.launch();
const report = [];
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
  for (const [template, file, component] of cases) {
    const csv = await readFile(join(fixtures, file), 'utf8');
    const csvBook = new ExcelJS.Workbook();
    const csvSheet = await csvBook.csv.read(Readable.from([csv]), { map: (value) => value });
    const records = csvSheet.getSheetValues().slice(3).filter(Boolean).map((row) => row.slice(1)).filter((row) => row[12] === template);
    if (!records.length) {
      console.log(`SKIP ${template}: CSV fixture has no rows (live exporter does not use CSV).`);
      continue;
    }
    const unit = records[0][11];
    const positions = records.filter((row) => row[11] === unit).map((row, index) => ({
      id: String(index), urutan: index, nama_jabatan_menpan: row[1], nama_jabatan_orb: row[1], kelas_jabatan_menpan: row[2],
      atasan_langsung: row[3], rumpun_jabatan: row[4], bezetting_asn: Number(row[5]), kebutuhan_asn: Number(row[6]),
      bezetting_non_asn: Number(row[8]), kebutuhan_non_asn: Number(row[9]),
    }));
    const roots = components.buildOrganizationTree(positions);
    for (const group of ['ASN', 'NON_ASN']) {
      const label = group === 'ASN' ? 'ASN/PNS (PNS, CPNS, PPPK)' : 'Non-ASN (PPPK Paruh Waktu dan Non PNS/ASN)';
      const props = { root: roots[0], node: roots[0], positions, group, template, search: '' };
      const chart = React.createElement(components[component], props);
      const html = renderToStaticMarkup(React.createElement('div', { className: 'peta-print-content min-w-max', 'data-peta-export-root': 'true' },
        React.createElement('div', { className: 'mb-7 text-center' }, React.createElement('h2', { className: 'text-sm font-black uppercase' }, `Peta Jabatan ${template}`), React.createElement('p', { className: 'text-[10px] font-bold' }, label)),
        React.createElement('div', { className: 'flex min-w-max justify-center gap-8 px-8 pb-8' }, chart)));
      await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${html}</body></html>`);
      await page.addScriptTag({ path: join(import.meta.dirname, 'node_modules/exceljs/dist/exceljs.min.js') });
      await page.addScriptTag({ content: exporter });
      const bytes = await page.evaluate(async ({ template, positions, group }) => {
        const book = window.createEditablePetaWorkbook({ ExcelJS: window.ExcelJS, content: document.querySelector('[data-peta-export-root]'), data: { template, selectedUkpd: template, positions }, group });
        return Array.from(await book.xlsx.writeBuffer());
      }, { template, positions, group });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(bytes));
      const worksheet = workbook.getWorksheet('Bagan Peta Jabatan');
      const layout = worksheetLayout(worksheet, { diagram: true });
      const expected = [];
      worksheet.eachRow((row) => row.eachCell((cell) => {
        if (cell.value !== null && (!cell.isMerged || cell.master.address === cell.address)) expected.push([cell.row - 1, cell.col - 1, cell.value]);
      }));
      const actual = [];
      for (const request of layout.requests) if (request.updateCells) {
        const update = request.updateCells;
        update.rows[0].values.forEach((cell, index) => {
          if (cell.userEnteredValue) actual.push([update.start.rowIndex, update.start.columnIndex + index, Object.values(cell.userEnteredValue)[0]]);
        });
      }
      assert.deepEqual(actual, expected, `Changed values/coordinates: ${template} ${group}`);
      assert.equal(layout.requests.filter((request) => request.mergeCells).length, worksheet.model.merges.length);
      assert.ok(actual.some((entry) => String(entry[2]).includes(label)));
      assert.ok(actual.length > 5);
      const filename = `${template}-${group}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (['RSUD B', 'PUSKESMAS', 'JAMKESJA'].includes(template)) {
        await page.locator('[data-peta-export-root]').screenshot({ path: join(artifacts, `${filename}.png`) });
        await writeFile(join(artifacts, `${filename}.xlsx`), Buffer.from(bytes));
      }
      report.push({ template, group, values: actual.length, merges: worksheet.model.merges.length, rows: layout.grid.rowCount, columns: layout.grid.columnCount });
      console.log(`PASS ${template} ${group}: ${actual.length} values, ${worksheet.model.merges.length} merges`);
    }
  }
  // Matrix capture uses logical row/column spans, unaffected by sticky positioning.
  await page.setContent('<table style="border-collapse:collapse"><colgroup><col style="width:48px"><col span="6" style="width:64px"><col style="width:56px"><col style="width:56px"><col style="width:56px"></colgroup><thead><tr><th colspan="7" rowspan="2">Identitas</th><th colspan="3">RSUD B<span>NON-ASN</span></th></tr><tr><th>B</th><th>K</th><th>S</th></tr></thead><tbody><tr><td colspan="7">Total</td><td>1.234</td><td>1.500</td><td>-266</td></tr></tbody></table>');
  const snapshot = await page.locator('table').evaluate(captureMatrix);
  const matrix = matrixWorksheet(new ExcelJS.Workbook(), snapshot);
  assert.equal(matrix.getCell('H3').value, 1234);
  assert.equal(matrix.getCell('J3').value, -266);
  assert.ok(matrix.model.merges.includes('H1:J1'));
  await writeFile(join(artifacts, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(`PASS ${report.length} chart exports and matrix DOM capture. Artifacts: ${artifacts}`);
} finally { await browser.close(); }
