const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { chromium } = require('playwright');

const repo = path.resolve(__dirname, '../..');
const req = createRequire(path.join(repo, 'package.json'));
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
const ts = req('typescript');

async function main() {
  const source = fs.readFileSync(path.join(repo, 'src/app/(app)/peta-jabatan/page.jsx'), 'utf8');
  const helpers = source.slice(source.indexOf('function number('), source.indexOf('export default function'));
  const js = ts.transpileModule(helpers, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const { RsudABChart, RsudCChart, UptChart } = new Function('React', `${js}; return { RsudABChart, RsudCChart, UptChart };`)(React);
  // Read chart definitions only; employee records and the database are never changed.
  const templates = ['RSUD A', 'RSKD', 'RSUD B', 'RSUD C', 'PPKP', 'LABKESDA', 'PUSLATKESDA', 'PK3D', 'JAMKESJA', 'PUSDATIN'];
  const query = `SELECT json_agg(p ORDER BY template_ukpd,nama_ukpd_source,urutan) FROM peta_jabatan p WHERE template_ukpd IN (${templates.map(template => `'${template}'`).join(',')})`;
  const raw = process.env.PETA_STRUCTURE_FIXTURE
    ? fs.readFileSync(process.env.PETA_STRUCTURE_FIXTURE, 'utf8')
    : execFileSync('docker', ['exec', 'sisdmk2-postgres', 'sh', '-c',
      'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "$1"', 'sh', query], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const units = new Map();
  const records = JSON.parse(raw);
  for (const template of templates) {
    const scoped = records.filter(position => position.template_ukpd === template);
    const names = [...new Set(scoped.map(position => position.nama_ukpd_source).filter(Boolean))];
    for (const name of names.length ? names : [null]) {
      const rows = scoped.filter(position => !position.nama_ukpd_source || position.nama_ukpd_source === name)
        .sort((a, b) => Number(a.urutan) - Number(b.urutan));
      if (rows.length) units.set(JSON.stringify([template, name]), rows);
    }
  }
  for (const template of templates) {
    assert.ok([...units.values()].some(rows => rows[0].template_ukpd === template), `Missing fixture: ${template}`);
  }
  const browser = await chromium.launch();
  let checks = 0;
  try {
    const page = await browser.newPage();
    for (const positions of units.values()) {
      const template = positions[0].template_ukpd;
      const isUpt = !['RSUD A', 'RSKD', 'RSUD B', 'RSUD C'].includes(template);
      const director = isUpt ? positions[0] : positions.find(p => /^direktur\b/i.test(p.nama_jabatan_menpan));
      assert.ok(director, `Director missing: ${template}`);
      const component = isUpt ? UptChart : template === 'RSUD C' ? RsudCChart : RsudABChart;
      for (const group of ['ASN', 'NON_ASN']) {
        const props = { root: { position: director }, positions, group, search: '', template };
        await page.setContent(renderToStaticMarkup(React.createElement(component, props)));
        const ids = await page.locator('[data-peta-position-id]').evaluateAll(elements => elements.map(el => el.dataset.petaPositionId));
        assert.deepEqual([...ids].sort(), positions.map(p => String(p.id)).sort(), `Missing or duplicate jobs: ${template} ${positions[0].nama_ukpd_source} ${group}`);
        if (['RSUD A', 'RSUD B', 'RSKD'].includes(template)) {
          const layout = await page.locator('[data-peta-leadership-branches]').evaluate(element => ({
            columns: element.style.gridTemplateColumns.split(' '),
            width: parseFloat(element.style.width),
            branches: element.querySelectorAll(':scope > div').length
          }));
          assert.equal(layout.branches, 2, 'SPI/functional tables must not reserve full-height branch columns');
          assert.equal(layout.columns.length, 2, 'Hospital branches must be adjacent');
          assert.ok(layout.width <= 3000, 'Hospital chart regained excessive empty columns');
          const functionalColumns = await page.locator('[data-peta-functional-column]').evaluateAll(elements => elements.map(element => element.querySelectorAll('table').length));
          assert.ok(functionalColumns.length > 0 && functionalColumns.every(count => count <= 1), 'Functional jobs must form one downward column per department');
          const supportLayout = await page.locator('[data-peta-support-layout]').evaluate(element => ({
            columns: element.style.gridTemplateColumns,
            tableColumn: element.querySelector(':scope > [data-peta-support-tables]').style.gridColumn,
            coordinatorColumn: element.querySelector(':scope > [data-peta-support-coordinators]').style.gridColumn,
            tableRows: element.querySelector(':scope > [data-peta-support-tables]').style.gridRow,
            coordinatorRow: element.querySelector(':scope > [data-peta-support-coordinators]').style.gridRow
          }));
          const headCount = template === 'RSUD A' ? 7 : 6;
          assert.equal(supportLayout.columns, `repeat(${headCount}, 300px)`, 'Department columns must match reference spacing');
          assert.equal(Number(supportLayout.tableColumn), headCount, 'Functional support table must remain at the right edge');
          assert.equal(supportLayout.coordinatorColumn, `${headCount - 4} / span 4`, 'Support coordinators must fill four columns to the left of the functional table');
          assert.equal(supportLayout.tableRows, '1 / span 3');
          assert.equal(supportLayout.coordinatorRow, '3');
        }
        if (template === 'RSKD') {
          const support = await page.locator('section[data-peta-position-id] > div:first-child').allTextContents();
          const expected = ['K3KL', 'FARMASI', 'REKAM MEDIS', 'LABORATORIUM', 'PENUNJANG KHUSUS', 'PENUNJANG TERAPI', 'GIZI', 'RADIOLOGI'];
          const indexes = expected.map(label => support.findIndex(title => title.toUpperCase().includes(label)));
          assert.ok(indexes.every((index, i) => index >= 0 && (!i || index > indexes[i - 1])), 'RSKD support order differs from reference');
        }
        if (template === 'LABKESDA') {
          const titles = await page.locator('section[data-peta-position-id] > div:first-child').allTextContents();
          const expected = ['KESEHATAN MASYARAKAT', 'PEMELIHARAAN DAN KALIBRASI', 'KESEHATAN KOTA', 'DOPING DAN KIMIA'];
          const indexes = expected.map(label => titles.findIndex(title => title.toUpperCase().includes(label)));
          assert.ok(indexes.every((index, i) => index >= 0 && (!i || index > indexes[i - 1])), 'Labkesda coordinator order differs from reference');
        }
        const keyword = isUpt ? 'data' : 'apoteker';
        await page.setContent(renderToStaticMarkup(React.createElement(component, { ...props, search: keyword })));
        const visibleRows = await page.locator('tbody tr[data-peta-position-id]').evaluateAll(elements => elements.map(el => el.dataset.petaPositionId));
        const visible = positions.filter(p => visibleRows.includes(String(p.id)));
        assert.ok(visible.length > 0, `Search returned no jobs: ${template}`);
        assert.ok(visible.every(p => (p.nama_jabatan_menpan || p.nama_jabatan_orb).toLowerCase().includes(keyword)), `Search returned unrelated jobs: ${template}`);
        checks++;
      }
      console.log(`PASS ${template}: ${positions[0].nama_ukpd_source || 'template'} (${positions.length} jobs, ASN/Non-ASN, search)`);
    }
    console.log(`PASS ${checks} structure checks; no records changed.`);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
