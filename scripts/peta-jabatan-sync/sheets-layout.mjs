// Sheet id 0 is replaced with the destination staging sheet id by Apps Script.
const sheetId = 0;

export function color(argb) {
  const hex = String(argb || '').replace(/^#/, '').slice(-6);
  if (!/^[\da-f]{6}$/i.test(hex)) return undefined;
  return { red: parseInt(hex.slice(0, 2), 16) / 255, green: parseInt(hex.slice(2, 4), 16) / 255, blue: parseInt(hex.slice(4, 6), 16) / 255 };
}

function format(cell) {
  const result = {};
  const { font, alignment, fill, border } = cell;
  if (font) {
    result.textFormat = {
      fontFamily: font.name || 'Arial', fontSize: Math.max(1, Math.round(font.size || 10)),
      bold: Boolean(font.bold), italic: Boolean(font.italic),
      ...(color(font.color?.argb) ? { foregroundColor: color(font.color.argb) } : {}),
    };
  }
  if (alignment) {
    result.horizontalAlignment = ({ center: 'CENTER', right: 'RIGHT' })[alignment.horizontal] || 'LEFT';
    result.verticalAlignment = ({ top: 'TOP', bottom: 'BOTTOM' })[alignment.vertical] || 'MIDDLE';
    result.wrapStrategy = alignment.wrapText ? 'WRAP' : 'CLIP';
  }
  if (fill?.type === 'pattern' && fill.pattern === 'solid' && color(fill.fgColor?.argb)) result.backgroundColor = color(fill.fgColor.argb);
  if (border) {
    const styles = { thin: 'SOLID', hair: 'SOLID', medium: 'SOLID_MEDIUM', thick: 'SOLID_THICK', double: 'DOUBLE', dotted: 'DOTTED', dashed: 'DASHED' };
    result.borders = {};
    for (const side of ['top', 'bottom', 'left', 'right']) {
      if (border[side]?.style) result.borders[side] = {
        style: styles[border[side].style] || 'SOLID',
        color: color(border[side].color?.argb) || color('334155'),
      };
    }
    if (!Object.keys(result.borders).length) delete result.borders;
  }
  return result;
}

function cellData(cell) {
  const result = { userEnteredFormat: format(cell) };
  // ExcelJS exposes the master's value on every cell of a merged range.
  if (cell.isMerged && cell.master.address !== cell.address) return result;
  const value = cell.value;
  if (value == null) return result;
  if (typeof value === 'number') result.userEnteredValue = { numberValue: value };
  else if (typeof value === 'boolean') result.userEnteredValue = { boolValue: value };
  else if (typeof value === 'string') result.userEnteredValue = { stringValue: value };
  else if (value.richText) result.userEnteredValue = { stringValue: value.richText.map((item) => item.text).join('') };
  else throw new Error(`Tipe nilai Excel tidak didukung di ${cell.address}; ekspor harus berisi nilai, bukan formula.`);
  return result;
}

function address(value) {
  const match = /^([A-Z]+)(\d+)$/.exec(value);
  if (!match) throw new Error(`Alamat sel tidak valid: ${value}`);
  return { row: Number(match[2]) - 1, column: [...match[1]].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1 };
}

function dimensions(values, dimension) {
  const requests = [];
  for (let start = 0; start < values.length;) {
    let end = start + 1;
    while (end < values.length && values[end] === values[start]) end += 1;
    requests.push({ updateDimensionProperties: {
      range: { sheetId, dimension, startIndex: start, endIndex: end },
      properties: { pixelSize: values[start] }, fields: 'pixelSize',
    } });
    start = end;
  }
  return requests;
}

export function worksheetLayout(worksheet, { diagram = false } = {}) {
  const rowCount = Math.max(1, worksheet.rowCount);
  const columnCount = Math.max(1, worksheet.columnCount, worksheet.columns?.length || 0);
  const widths = Array.from({ length: columnCount }, (_, index) => diagram ? 8 : Math.round((worksheet.getColumn(index + 1).width || 10) * 7 + 5));
  const heights = Array.from({ length: rowCount }, (_, index) => Math.max(2, Math.round((worksheet.getRow(index + 1).height || 15) / 0.75)));
  const dimensionRequests = [...dimensions(widths, 'COLUMNS'), ...dimensions(heights, 'ROWS')];
  const requests = [...dimensionRequests];
  for (let row = 1; row <= rowCount; row += 1) {
    // Sparse runs keep wide diagrams small while retaining connector-only cells.
    let start = null;
    let values = [];
    const flush = () => {
      if (start === null) return;
      requests.push({ updateCells: { start: { sheetId, rowIndex: row - 1, columnIndex: start - 1 }, rows: [{ values }], fields: 'userEnteredValue,userEnteredFormat' } });
      start = null;
      values = [];
    };
    worksheet.getRow(row).eachCell({ includeEmpty: true }, (cell, column) => {
      const value = cellData(cell);
      if (!value.userEnteredValue && !Object.keys(value.userEnteredFormat).length) { flush(); return; }
      if (start === null) start = column;
      values.push(value);
      if (values.length >= 200) flush();
    });
    flush();
  }
  for (const merge of worksheet.model.merges || []) {
    const [first, last] = merge.split(':').map(address);
    const range = { sheetId, startRowIndex: first.row, endRowIndex: last.row + 1, startColumnIndex: first.column, endColumnIndex: last.column + 1 };
    // A retry after a network timeout must be safe even if the merge was applied.
    requests.push({ unmergeCells: { range } });
    requests.push({ mergeCells: { range, mergeType: 'MERGE_ALL' } });
  }
  return {
    grid: { rowCount, columnCount, hideGridlines: true, frozenRowCount: diagram ? 0 : 2, frozenColumnCount: diagram ? 0 : 7 },
    dimensions: dimensionRequests,
    requests,
  };
}

export function requestChunks(requests, maxBytes = 450000, maxRequests = 150) {
  const chunks = [];
  let chunk = [];
  let size = 0;
  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    // Keep each unmerge/merge pair in one atomic Sheets request.
    const group = request.unmergeCells && requests[index + 1]?.mergeCells ? [request, requests[++index]] : [request];
    const bytes = Buffer.byteLength(JSON.stringify(group));
    if (bytes > maxBytes) throw new Error('Satu request melebihi batas chunk.');
    if (chunk.length && (size + bytes > maxBytes || chunk.length + group.length > maxRequests)) { chunks.push(chunk); chunk = []; size = 0; }
    chunk.push(...group);
    size += bytes;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}
