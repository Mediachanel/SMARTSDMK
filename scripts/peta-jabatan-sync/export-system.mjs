import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import ExcelJS from 'exceljs';
import { chromium } from 'playwright';
import { worksheetLayout, requestChunks } from './sheets-layout.mjs';
import { captureMatrix, matrixWorksheet } from './capture-matrix.mjs';

const { values: options } = parseArgs({ options: {
  url: { type: 'string', default: 'https://smart.sdmk.org' },
  session: { type: 'string' },
  out: { type: 'string' },
  templates: { type: 'string' },
  login: { type: 'boolean', default: false },
} });
if (!options.session || (!options.login && !options.out)) {
  throw new Error('Gunakan --session /path/session.json --out /path/export-dir. Untuk login awal: --login --session /path/session.json');
}
const origin = new URL(options.url).origin;
const sessionPath = resolve(options.session);
if (!options.login) {
  let session;
  try { session = JSON.parse(await readFile(sessionPath, 'utf8')); }
  catch { throw new Error('File sesi login belum tersedia atau tidak valid. Jalankan --login --session pada komputer dengan browser desktop dahulu.'); }
  const host = new URL(origin).hostname;
  const authenticated = session.cookies?.some((cookie) => {
    const domain = String(cookie.domain || '').replace(/^\./, '');
    return cookie.name === 'sdm_session' && cookie.value &&
      (host === domain || host.endsWith(`.${domain}`)) &&
      (cookie.expires === -1 || cookie.expires > Date.now() / 1000);
  });
  if (!authenticated) throw new Error('Sesi tidak memiliki login SMART SDMK yang masih berlaku untuk origin ini. Jalankan --login kembali.');
}
const browser = await chromium.launch({ headless: !options.login });
try {
  const context = await browser.newContext({ viewport: { width: 1800, height: 1100 }, ...(options.login ? {} : { storageState: sessionPath }), acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  if (options.login) {
    await page.goto(`${origin}/peta-jabatan`);
    console.log('Login di jendela browser. Sesi disimpan setelah halaman peta dan data berhasil dimuat.');
    await page.waitForURL('**/peta-jabatan', { timeout: 600000 });
    await page.getByRole('button', { name: 'Export Excel', exact: true }).waitFor({ timeout: 600000 });
    const response = await context.request.get(`${origin}/api/peta-jabatan`);
    if (!response.ok() || !(await response.json()).success) throw new Error('Sesi belum memiliki akses peta jabatan.');
    await mkdir(resolve(sessionPath, '..'), { recursive: true });
    await context.storageState({ path: sessionPath });
    await chmod(sessionPath, 0o600);
    console.log('Sesi tersimpan. Jalankan export tanpa --login.');
  } else {
    // Only read the existing UI/API. Never submit edit or verification actions.
    await context.route('**/api/**', async (route) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.abort();
      return route.continue();
    });
    const response = await context.request.get(`${origin}/api/peta-jabatan`);
    if (!response.ok()) throw new Error(`Sesi tidak dapat membaca peta (HTTP ${response.status()}). Login ulang dengan --login.`);
    const body = await response.json();
    if (!body.success || !Array.isArray(body.data?.templates)) throw new Error('Daftar jenis UKPD tidak tersedia untuk sesi ini.');
    const templates = options.templates ? options.templates.split(',').map((value) => value.trim()) : body.data.templates;
    if (!templates.length || templates.some((value) => !body.data.templates.includes(value))) throw new Error('Jenis UKPD tidak ditemukan pada sistem.');
    const output = resolve(options.out);
    await mkdir(output, { recursive: true });
    const generation = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const artifactDirectory = join(output, 'layout-v2-artifacts', generation);
    await mkdir(artifactDirectory, { recursive: true });
    const manifest = { schema: 'peta-layout-v2', generation, updated_at: new Date().toISOString(), source: origin, sheets: [] };
    const hashes = [];
    const publish = async (key, value) => {
      const text = JSON.stringify(value);
      // Existing endpoint allows only .csv filenames. V2 explicitly decodes JSON.
      await writeFile(join(output, `${key}.csv`), text);
      hashes.push({ file: key, sha256: createHash('sha256').update(text).digest('hex') });
    };
    for (const template of templates) {
      for (const kind of ['PETA', 'MATRIKS']) {
        const matrix = kind === 'MATRIKS';
        await page.goto(`${origin}/peta-jabatan${matrix ? '/matriks' : ''}`);
        if (matrix) {
          await page.getByRole('heading', { name: template, exact: true }).click();
          await page.getByRole('heading', { name: `Perbandingan ${template}`, exact: true }).waitFor();
        } else {
          await page.locator('select').filter({ has: page.locator('option', { hasText: 'Ringkasan seluruh jenis UKPD' }) }).selectOption({ label: template });
          await page.locator('[data-peta-export-root="true"] h2').filter({ hasText: template }).waitFor();
        }
        for (const [group, label] of [['ASN', 'ASN/PNS'], ['NON ASN', 'Non-ASN']]) {
          console.log(`${kind} ${template} / ${label}`);
          await page.getByRole('button', { name: label, exact: true }).click();
          const groupPattern = group === 'ASN' ? 'ASN/PNS' : 'Non-ASN';
          if (matrix) {
            await page.waitForFunction((expected) => document.querySelector('table thead tr th[colspan="3"] span')?.textContent === expected, group === 'ASN' ? 'ASN' : 'NON-ASN');
          } else {
            await page.waitForFunction((expected) => document.querySelector('[data-peta-export-root="true"] > div > p')?.textContent.startsWith(expected), groupPattern);
          }
          await page.evaluate(() => document.fonts.ready);
          const workbook = new ExcelJS.Workbook();
          const artifactName = `${kind}-${template}-${group}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          let worksheet;
          if (matrix) {
            const snapshot = await page.locator('table').evaluate(captureMatrix);
            worksheet = matrixWorksheet(workbook, snapshot);
            await workbook.xlsx.writeFile(join(artifactDirectory, `${artifactName}.xlsx`));
          } else {
            const downloadPromise = page.waitForEvent('download');
            await page.getByRole('button', { name: 'Export Excel', exact: true }).click();
            const download = await downloadPromise;
            const file = join(artifactDirectory, `${artifactName}.xlsx`);
            await download.saveAs(file);
            await workbook.xlsx.readFile(file);
            worksheet = workbook.getWorksheet('Bagan Peta Jabatan');
            if (!worksheet) throw new Error('Ekspor sistem tidak memiliki sheet Bagan Peta Jabatan.');
            const allText = worksheet.getSheetValues().flat().filter((value) => typeof value === 'string').join(' ');
            if (!allText.includes(groupPattern)) throw new Error(`Label kelompok ${label} tidak ditemukan pada bagan.`);
          }
          const layout = worksheetLayout(worksheet, { diagram: !matrix });
          const index = manifest.sheets.length;
          const base = `peta-layout-v2-${generation}-${index}`;
          const chunks = requestChunks(layout.requests);
          const chunkKeys = [];
          for (let chunk = 0; chunk < chunks.length; chunk += 1) {
            const key = `${base}-part-${chunk}`;
            await publish(key, { schema: 'peta-layout-v2-chunk', generation, requests: chunks[chunk] });
            chunkKeys.push(key);
          }
          const entry = { name: `${kind} ${group} - ${template}`, kind, group, template, file: base };
          await publish(base, { schema: 'peta-layout-v2-sheet', generation, ...entry, grid: layout.grid, dimensions: layout.dimensions, chunks: chunkKeys });
          manifest.sheets.push(entry);
        }
      }
    }
    await writeFile(join(artifactDirectory, 'checksums.json'), JSON.stringify(hashes, null, 2));
    await writeFile(join(output, `peta-layout-v2-${generation}-manifest.csv`), JSON.stringify(manifest));
    // Publish the pointer last; interrupted exports never replace a usable generation.
    const temporary = join(output, `peta-layout-v2-${generation}-pending.csv`);
    await writeFile(temporary, JSON.stringify(manifest));
    await rename(temporary, join(output, 'peta-layout-v2.csv'));
    console.log(`Selesai: ${manifest.sheets.length} sheet. Manifest: ${join(output, 'peta-layout-v2.csv')}`);
  }
} finally {
  await browser.close();
}
