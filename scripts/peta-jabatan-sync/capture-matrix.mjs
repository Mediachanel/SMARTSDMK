// Runs in the browser against the actual matrix table, including its span headers.
export function captureMatrix(table) {
  const rgb = (value) => {
    const match = String(value).match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return null;
    const alpha = match[4] === undefined ? 1 : Number(match[4]);
    return 'FF' + match.slice(1, 4).map((part) => Math.round(Number(part) * alpha + 255 * (1 - alpha)).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const occupied = new Set();
  const cells = [];
  const heights = [];
  [...table.rows].forEach((row, rowIndex) => {
    heights.push(row.getBoundingClientRect().height);
    let column = 0;
    for (const cell of row.cells) {
      while (occupied.has(`${rowIndex}:${column}`)) column += 1;
      const style = getComputedStyle(cell);
      const text = cell.innerText.trim();
      const metric = column >= 7 && rowIndex >= table.tHead.rows.length;
      const numeric = metric && /^-?\d+(?:\.\d{3})*(?:,\d+)?$/.test(text);
      let background = null;
      let parent = cell;
      while (parent && !background) { background = rgb(getComputedStyle(parent).backgroundColor); parent = parent.parentElement; }
      const borders = {};
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (style[`border${side}Style`] !== 'none' && parseFloat(style[`border${side}Width`]) > 0) {
          borders[side.toLowerCase()] = { style: parseFloat(style[`border${side}Width`]) >= 2 ? 'medium' : 'thin', color: { argb: rgb(style[`border${side}Color`]) || 'FF334155' } };
        }
      }
      cells.push({ row: rowIndex + 1, column: column + 1, rowSpan: cell.rowSpan, colSpan: cell.colSpan,
        value: numeric ? Number(text.replace(/\./g, '').replace(',', '.')) : text,
        font: { name: 'Arial', size: parseFloat(style.fontSize) * 0.75, bold: Number(style.fontWeight) >= 600, color: { argb: rgb(style.color) || 'FF000000' } },
        alignment: { horizontal: ['center', 'right'].includes(style.textAlign) ? style.textAlign : 'left', vertical: 'middle', wrapText: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: background || 'FFFFFFFF' } }, border: borders,
      });
      for (let r = rowIndex; r < rowIndex + cell.rowSpan; r += 1) for (let c = column; c < column + cell.colSpan; c += 1) occupied.add(`${r}:${c}`);
      column += cell.colSpan;
    }
  });
  return { cells, heights, widths: [...table.querySelectorAll('col')].map((column) => parseFloat(column.style.width)) };
}

export function matrixWorksheet(workbook, snapshot) {
  const sheet = workbook.addWorksheet('Matriks');
  snapshot.widths.forEach((width, index) => { sheet.getColumn(index + 1).width = (width - 5) / 7; });
  snapshot.heights.forEach((height, index) => { sheet.getRow(index + 1).height = height * 0.75; });
  for (const entry of snapshot.cells) {
    if (entry.rowSpan > 1 || entry.colSpan > 1) sheet.mergeCells(entry.row, entry.column, entry.row + entry.rowSpan - 1, entry.column + entry.colSpan - 1);
    const cell = sheet.getCell(entry.row, entry.column);
    cell.value = entry.value;
    cell.style = { font: entry.font, alignment: entry.alignment, fill: entry.fill, border: entry.border };
  }
  sheet.views = [{ state: 'frozen', xSplit: 7, ySplit: 2, showGridLines: false }];
  return sheet;
}
