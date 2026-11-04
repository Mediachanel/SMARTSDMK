// Standalone companion: reads the existing CSV endpoint; no application login.
function pasangPetaLangsung() {
  if (typeof Sheets === 'undefined') throw new Error('Aktifkan Google Sheets API pada Services Apps Script.');
  PropertiesService.getScriptProperties().setProperty('PETA_LANGSUNG_BOOK', SpreadsheetApp.getActive().getId());
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'menuPetaLangsung').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('menuPetaLangsung').forSpreadsheet(SpreadsheetApp.getActive()).onOpen().create();
  menuPetaLangsung();
}

function menuPetaLangsung() {
  SpreadsheetApp.getUi().createMenu('Peta Langsung')
    .addItem('Update dari server', 'updatePetaLangsung')
    .addItem('Lanjutkan update', 'lanjutPetaLangsung').addToUi();
}

function plFetch_(file) {
  const token = PropertiesService.getScriptProperties().getProperty('PETA_JABATAN_EXPORT_TOKEN') || '';
  const response = UrlFetchApp.fetch('https://smart.sdmk.org/api/peta-jabatan/export?file=' + encodeURIComponent(file.replace(/\.csv$/i, '')), {
    headers: { 'x-export-token': token }, muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) throw new Error('Gagal mengambil data HTTP ' + response.getResponseCode() + '. Periksa token dan ketersediaan export server.');
  return response.getContentText('UTF-8');
}

function plKey_(value) { return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase(); }

function plPositions_(values) {
  const head = values.findIndex(row => plKey_(row[0]) === 'LEVEL');
  if (head < 0) throw new Error('Header LEVEL tidak ditemukan; bagan tidak diganti dengan tabel.');
  const headers = values[head].map(plKey_);
  const required = ['BAGAN JABATAN', 'KELAS', 'ATASAN LANGSUNG', 'RUMPUN JABATAN', 'JENIS PETA', 'B PNS', 'K PNS', 'B NON PNS', 'K NON PNS'];
  required.forEach(name => { if (!headers.includes(name)) throw new Error('Kolom wajib tidak tersedia: ' + name); });
  const map = new Map();
  for (const row of values.slice(head + 1)) {
    const get = name => String(row[headers.indexOf(name)] || '').trim();
    if (!get('BAGAN JABATAN')) continue;
    const title = get('BAGAN JABATAN'), boss = get('ATASAN LANGSUNG'), family = get('RUMPUN JABATAN'), type = get('JENIS PETA'), klass = get('KELAS');
    const key = JSON.stringify([type, title, boss, family, klass].map(plKey_));
    if (!map.has(key)) map.set(key, { id: map.size, title, boss, family, type, klass, ASN: { b: 0, k: 0 }, NON: { b: 0, k: 0 } });
    const item = map.get(key);
    for (const [group, suffix] of [['ASN', 'PNS'], ['NON', 'NON PNS']]) {
      for (const metric of ['b', 'k']) {
        const text = get(metric.toUpperCase() + ' ' + suffix);
        const number = Number(text || 0);
        if (!Number.isFinite(number)) throw new Error('Angka tidak valid: ' + text);
        item[group][metric] += number;
      }
    }
  }
  return [...map.values()];
}

// Matching priorities follow the system's bossMatchScore; ambiguous parents are rejected.
function plScore_(manager, item) {
  if (manager.id === item.id) return -1;
  const m = plKey_(manager.title), b = plKey_(item.boss);
  if (!m || !b) return -1;
  if (m === b) return 1000 + m.length;
  const descriptor = text => (text.match(/\(([^)]+)\)/)?.[1] || '').replace(/SUB\s*KELOMPOK/g, 'SUB KELOMPOK').replace(/\bKETUA\b/g, '').replace(/\s+/g, ' ').trim();
  const md = descriptor(m), bd = descriptor(b);
  if (md && bd && md === bd) return 900 + md.length;
  const relationship = text => {
    const normalized = text.replace(/PUSAT KESEHATAN MASYARAKAT/g, 'PUSKESMAS');
    return (normalized.match(/\(([^)]+)\)/)?.[1] || normalized).replace(/\bKECAMATAN\b/g, '').replace(/^(ADMINISTRATOR|PENGAWAS|PIMPINAN TINGGI)(\s+(UTAMA|MADYA|MUDA|PERTAMA|PRATAMA))?\s*/g, '').replace(/^(KEPALA|KETUA)\s+/g, '').replace(/\s+/g, ' ').trim();
  };
  const mr = relationship(m), br = relationship(b);
  if (mr.length >= 5 && mr === br) return 850 + mr.length;
  if (/PIMPINAN TINGGI|ADMINISTRATOR|PENGAWAS/.test(plKey_(manager.family)) && b.length >= 8 && m.startsWith(b)) return 800 + b.length;
  const core = text => text.replace(/^KEPALA\s+(SEKSI|SUBBAGIAN)\s+/, '').replace(/\bKESEHATAN\b/g, '').replace(/\s+/g, ' ').trim();
  const mc = core(m), bc = core(b);
  if (m.startsWith('KEPALA ') && b.startsWith('KEPALA ') && mc.length >= 8 && bc.length >= 8 && (mc.includes(bc) || bc.includes(mc))) return 700 + Math.min(mc.length, bc.length);
  return -1;
}

function plTree_(positions) {
  const nodes = positions.map(position => ({ position, children: [], leaves: [], parent: null }));
  for (const node of nodes) {
    const candidates = nodes.map(parent => ({ parent, score: plScore_(parent.position, node.position) })).filter(item => item.score >= 0).sort((a, b) => b.score - a.score);
    if (candidates.length > 1 && candidates[0].score === candidates[1].score) throw new Error('Atasan ambigu untuk ' + node.position.title + '. Periksa sumber data.');
    node.parent = candidates[0]?.parent || null;
  }
  for (const node of nodes) {
    const seen = new Set();
    for (let current = node; current; current = current.parent) {
      if (seen.has(current)) throw new Error('Relasi atasan berputar pada ' + node.position.title);
      seen.add(current);
    }
    if (node.parent) node.parent.children.push(node);
  }
  const managers = new Set(nodes.filter(node => node.children.length || /PIMPINAN TINGGI|ADMINISTRATOR|PENGAWAS/.test(plKey_(node.position.family))));
  const structural = node => managers.has(node);
  for (const node of nodes) {
    node.leaves = node.children.filter(child => !structural(child)).map(child => child.position);
    node.children = node.children.filter(structural);
  }
  return nodes.filter(node => !node.parent);
}

function plPlan_(positions, group, title) {
  const roots = plTree_(positions);
  const cells = [], merges = [], lines = [];
  const width = 14, gap = 2;
  const measure = node => {
    node.span = Math.max(width, node.children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, node.children.length - 1) * gap);
    return node.span;
  };
  roots.forEach(measure);
  const columns = Math.max(width, roots.reduce((sum, root) => sum + root.span, 0) + Math.max(0, roots.length - 1) * gap);
  let rows = 4;
  const box = (r, c, h, w, text, kind) => { cells.push({ r, c, h, w, text, kind }); if (h > 1 || w > 1) merges.push({ r, c, h, w }); rows = Math.max(rows, r + h); };
  box(0, 0, 2, columns, title, 'title');
  box(2, 0, 1, columns, group === 'ASN' ? 'ASN/PNS (PNS, CPNS, PPPK)' : 'Non-ASN (PPPK Paruh Waktu dan Non PNS/ASN)', 'label');
  const metric = item => { const value = item[group]; return [value.b, value.k, value.b - value.k]; };
  const render = (node, left, top) => {
    const center = left + Math.floor(node.span / 2), col = center - 7;
    box(top, col, 3, width, node.position.title, 'head');
    box(top + 3, col, 1, width, '(' + [node.position.klass || '-', ...metric(node.position)].join('-') + ')', 'metric');
    let next = top + 5;
    for (const functional of [true, false]) {
      const entries = node.leaves.filter(item => /FUNGSIONAL/.test(plKey_(item.family)) === functional);
      if (!entries.length) continue;
      box(next++, col, 1, width, functional ? 'KELOMPOK JABATAN FUNGSIONAL' : 'JABATAN PELAKSANA', 'label');
      const starts = [0, 6, 8, 10, 12], widths = [6, 2, 2, 2, 2];
      ['Nama Jabatan', 'KL', 'B', 'K', 'S'].forEach((value, i) => box(next, col + starts[i], 1, widths[i], value, 'label'));
      next++;
      entries.forEach(item => {
        const height = Math.max(2, Math.ceil(item.title.length / 24));
        [item.title, item.klass, ...metric(item)].forEach((value, i) => box(next, col + starts[i], height, widths[i], value, i ? 'number' : 'text'));
        next += height;
      });
      next++;
    }
    if (node.children.length) {
      let childLeft = left;
      const centers = node.children.map(child => { const value = childLeft + Math.floor(child.span / 2); childLeft += child.span + gap; return value; });
      lines.push({ r: next, c: Math.min(center, ...centers), h: 1, w: Math.max(center, ...centers) - Math.min(center, ...centers) + 1, side: 'top' });
      // The connector starts below the attached tables, avoiding their text.
      lines.push({ r: next - 1, c: center, h: 2, w: 1, side: 'left' });
      childLeft = left;
      node.children.forEach((child, index) => {
        lines.push({ r: next, c: centers[index], h: 2, w: 1, side: 'left' });
        render(child, childLeft, next + 2); childLeft += child.span + gap;
      });
    }
  };
  let left = 0;
  roots.forEach(root => { render(root, left, 5); left += root.span + gap; });
  return { cells, merges, lines, rows: rows + 2, columns };
}

function plRequests_(plan, sheetId) {
  const range = item => ({ sheetId, startRowIndex: item.r, endRowIndex: item.r + item.h, startColumnIndex: item.c, endColumnIndex: item.c + item.w });
  const border = { style: 'SOLID', color: { red: .2, green: .28, blue: .4 } };
  const requests = [
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: plan.columns }, properties: { pixelSize: 32 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: plan.rows }, properties: { pixelSize: 20 }, fields: 'pixelSize' } },
  ];
  if (plan.matrix) {
    const widths = [48, 208, 64, 208, 64, 208, 208];
    requests[0].updateDimensionProperties.properties.pixelSize = 56;
    requests[1].updateDimensionProperties.properties.pixelSize = 64;
    widths.forEach((pixelSize, index) => requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 }, properties: { pixelSize }, fields: 'pixelSize' } }));
  }
  for (const cell of plan.cells) {
    const bold = ['title', 'head', 'label'].includes(cell.kind);
    const format = { textFormat: { fontFamily: 'Arial', fontSize: cell.kind === 'title' ? 12 : 9, bold }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: cell.kind === 'text' ? 'LEFT' : 'CENTER' };
    if (cell.kind === 'head') format.backgroundColor = { red: .72, green: .81, blue: .89 };
    requests.push({ repeatCell: { range: range(cell), cell: { userEnteredFormat: format }, fields: 'userEnteredFormat' } });
    requests.push({ updateCells: { start: { sheetId, rowIndex: cell.r, columnIndex: cell.c }, rows: [{ values: [{ userEnteredValue: typeof cell.text === 'number' ? { numberValue: cell.text } : { stringValue: String(cell.text || '') } }] }], fields: 'userEnteredValue' } });
    if (cell.r >= 5) requests.push({ updateBorders: { range: range(cell), top: border, bottom: border, left: border, right: border } });
  }
  plan.merges.forEach(item => requests.push({ mergeCells: { range: range(item), mergeType: 'MERGE_ALL' } }));
  plan.lines.forEach(item => requests.push({ updateBorders: { range: range(item), [item.side]: border } }));
  return requests;
}

function updatePetaLangsung() { plRun_(true); }
function lanjutPetaLangsung() { plRun_(false); }

function plMatrix_(values, group, title) {
  const header = values.findIndex(row => row.some(cell => / - B ASN$/.test(String(cell))));
  if (header < 0) throw new Error('Header matriks B ASN tidak ditemukan: ' + title);
  const suffix = group === 'ASN' ? 'ASN' : 'NON-ASN';
  const indices = values[header].map((value, index) => ({ value: String(value), index })).filter(item => item.index < 7 || new RegExp(' - [BKS] ' + suffix + '$').test(item.value));
  if (indices.length <= 7) throw new Error('Kolom ' + suffix + ' tidak tersedia: ' + title);
  const cells = [], merges = [];
  const columns = indices.length;
  const add = (r, c, h, w, text, kind) => { cells.push({ r, c, h, w, text, kind }); if (h > 1 || w > 1) merges.push({ r, c, h, w }); };
  add(0, 0, 2, columns, title + ' - ' + suffix, 'title');
  for (let col = 0; col < 7; col++) add(2, col, 2, 1, indices[col].value, 'label');
  for (let col = 7; col < columns; col += 3) {
    const labels = indices.slice(col, col + 3).map(item => item.value);
    const unit = labels[0].replace(/ - B (?:NON-)?ASN$/, '');
    if (labels.length !== 3 || labels.some((value, i) => value !== unit + ' - ' + ['B', 'K', 'S'][i] + ' ' + suffix)) throw new Error('Susunan B/K/S tidak lengkap: ' + unit);
    add(2, col, 1, 3, unit + ' / ' + suffix, 'label');
    ['B', 'K', 'S'].forEach((value, i) => add(3, col + i, 1, 1, value, 'label'));
  }
  let row = 4;
  for (const source of values.slice(header + 1)) {
    if (!source.some(value => String(value).trim())) continue;
    indices.forEach((item, col) => {
      const raw = source[item.index] || '';
      const value = col >= 7 ? Number(raw || 0) : raw;
      if (col >= 7 && !Number.isFinite(value)) throw new Error('Angka matriks tidak valid: ' + raw);
      add(row, col, 1, 1, value, col < 7 ? 'text' : 'number');
    });
    row++;
  }
  return { cells, merges, lines: [], rows: row, columns, matrix: true };
}

function plRun_(start) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const properties = PropertiesService.getScriptProperties();
  try {
    if (typeof Sheets === 'undefined') throw new Error('Aktifkan Google Sheets API pada Services.');
    let state = JSON.parse(properties.getProperty('PETA_LANGSUNG_JOB') || 'null');
    const manifest = JSON.parse(plFetch_('manifest'));
    const sources = manifest.sheets.filter(item => !['RINGKASAN DB', 'REKAP', 'REKAP ALL'].includes(plKey_(item.name)));
    if (!state) {
      if (!start) return;
      state = { source: 0, job: 0, version: manifest.updated_at };
    }
    if (state.version !== manifest.updated_at) throw new Error('Export server berubah saat update. Tunggu proses selesai atau hapus property PETA_LANGSUNG_JOB untuk memulai ulang.');
    const book = SpreadsheetApp.openById(properties.getProperty('PETA_LANGSUNG_BOOK') || SpreadsheetApp.getActive().getId());
    const began = Date.now();
    while (state.source < sources.length && Date.now() - began < 150000) {
      const source = sources[state.source];
      const values = Utilities.parseCsv(plFetch_(source.file));
      const isPeta = plKey_(source.name).startsWith('PETA ');
      const positions = isPeta ? plPositions_(values) : [];
      const types = isPeta ? [...new Set(positions.map(item => item.type))] : [source.name];
      const jobs = types.flatMap(type => ['ASN', 'NON'].map(group => ({ type, group })));
      if (state.job >= jobs.length) { state.source++; state.job = 0; properties.setProperty('PETA_LANGSUNG_JOB', JSON.stringify(state)); continue; }
      const { type, group } = jobs[state.job];
      const name = (isPeta ? 'PETA ' : 'MATRIKS ') + (group === 'ASN' ? 'ASN' : 'NON ASN') + ' - ' + type;
      const plan = isPeta ? plPlan_(positions.filter(item => item.type === type), group, 'PETA JABATAN ' + type) : plMatrix_(values, group, 'MATRIKS ' + type);
      if (plan.rows * plan.columns > 3000000) throw new Error('Bagan ' + type + ' terlalu besar untuk satu tab.');
      const target = book.getSheetByName(name);
      if (target && !target.getDeveloperMetadata().some(item => item.getKey() === 'PETA_LANGSUNG' && item.getValue() === '1')) throw new Error('Nama tab sudah dipakai: ' + name + '. Ganti nama tab lama sebelum melanjutkan.');
      const stage = state.stageId ? book.getSheetById(state.stageId) : book.insertSheet('_PL_' + Date.now());
      if (!stage || !stage.getName().startsWith('_PL_')) throw new Error('Tab penampung hilang. Hapus PETA_LANGSUNG_JOB untuk memulai ulang.');
      try {
        const grid = { rowCount: plan.rows, columnCount: plan.columns, hideGridlines: true, frozenRowCount: plan.matrix ? 4 : 0, frozenColumnCount: plan.matrix ? 7 : 0 };
        if (!state.stageId) {
          Sheets.Spreadsheets.batchUpdate({ requests: [{ updateSheetProperties: { properties: { sheetId: stage.getSheetId(), gridProperties: grid }, fields: 'gridProperties' } }] }, book.getId());
          state.stageId = stage.getSheetId(); state.offset = 0;
          properties.setProperty('PETA_LANGSUNG_JOB', JSON.stringify(state));
        }
        const requests = plRequests_(plan, stage.getSheetId());
        for (let i = state.offset || 0; i < requests.length && Date.now() - began < 150000; i += 300) {
          const batch = requests.slice(i, i + 300).flatMap(request => request.mergeCells ? [{ unmergeCells: { range: request.mergeCells.range } }, request] : [request]);
          Sheets.Spreadsheets.batchUpdate({ requests: batch }, book.getId());
          state.offset = Math.min(i + 300, requests.length);
          properties.setProperty('PETA_LANGSUNG_JOB', JSON.stringify(state));
          Utilities.sleep(1100);
        }
        if (state.offset < requests.length || Date.now() - began >= 150000) break;
        stage.addDeveloperMetadata('PETA_LANGSUNG', '1');
        if (target) {
          const id = target.getSheetId();
          const dimensions = plRequests_(plan, id).filter(request => request.updateDimensionProperties);
          const targetGrid = { ...grid, rowCount: Math.max(plan.rows, target.getMaxRows()), columnCount: Math.max(plan.columns, target.getMaxColumns()) };
          const all = { sheetId: id, startRowIndex: 0, endRowIndex: targetGrid.rowCount, startColumnIndex: 0, endColumnIndex: targetGrid.columnCount };
          Sheets.Spreadsheets.batchUpdate({ requests: [
            { updateSheetProperties: { properties: { sheetId: id, gridProperties: targetGrid }, fields: 'gridProperties' } },
            { unmergeCells: { range: all } },
            { updateCells: { range: all, fields: 'userEnteredValue,userEnteredFormat' } },
            { copyPaste: { source: { sheetId: stage.getSheetId(), startRowIndex: 0, endRowIndex: plan.rows, startColumnIndex: 0, endColumnIndex: plan.columns }, destination: { sheetId: id, startRowIndex: 0, endRowIndex: plan.rows, startColumnIndex: 0, endColumnIndex: plan.columns }, pasteType: 'PASTE_NORMAL' } },
            ...dimensions,
          ] }, book.getId());
        } else stage.setName(name);
      } catch (error) { throw error; }
      state.job++;
      state.stageId = null; state.offset = 0;
      properties.setProperty('PETA_LANGSUNG_JOB', JSON.stringify(state));
      if (stage.getName().startsWith('_PL_')) book.deleteSheet(stage);
      book.toast('Selesai: ' + name);
    }
    const triggers = ScriptApp.getProjectTriggers().filter(item => item.getHandlerFunction() === 'lanjutPetaLangsung');
    if (state.source >= sources.length) {
      properties.deleteProperty('PETA_LANGSUNG_JOB');
      triggers.forEach(item => ScriptApp.deleteTrigger(item));
      book.toast('Bagan ASN dan Non-ASN selesai diperbarui.');
    } else if (!triggers.length) ScriptApp.newTrigger('lanjutPetaLangsung').timeBased().everyMinutes(5).create();
  } catch (error) {
    ScriptApp.getProjectTriggers().filter(item => item.getHandlerFunction() === 'lanjutPetaLangsung').forEach(item => ScriptApp.deleteTrigger(item));
    throw error;
  } finally { lock.releaseLock(); }
}
