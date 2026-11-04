const COLUMN_PIXELS = 8;
const LINE_COLOR = "FF334155";

function colorToArgb(value) {
  const input = String(value || "").trim();
  if (!input || input === "transparent") return null;
  const hex = input.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const normalized =
      hex.length === 3
        ? hex
            .split("")
            .map((item) => `${item}${item}`)
            .join("")
        : hex;
    return `FF${normalized.toUpperCase()}`;
  }
  const rgb = input.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)(?:\D+(\d+(?:\.\d+)?))?\s*\)$/i,
  );
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) < 0.05)) return null;
  return `FF${[rgb[1], rgb[2], rgb[3]]
    .map((item) =>
      Math.max(0, Math.min(255, Math.round(Number(item))))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

function nearestBackground(element, boundary) {
  let current = element;
  while (current && current !== boundary.parentElement) {
    const color = colorToArgb(window.getComputedStyle(current).backgroundColor);
    if (color) return color;
    if (current === boundary) break;
    current = current.parentElement;
  }
  return null;
}

function borderStyle(style, width, color) {
  if (style === "none" || Number.parseFloat(width) <= 0) return null;
  return {
    style: Number.parseFloat(width) >= 2 ? "medium" : "thin",
    color: { argb: colorToArgb(color) || LINE_COLOR },
  };
}

function elementBorders(computed) {
  const borders = {
    top: borderStyle(
      computed.borderTopStyle,
      computed.borderTopWidth,
      computed.borderTopColor,
    ),
    left: borderStyle(
      computed.borderLeftStyle,
      computed.borderLeftWidth,
      computed.borderLeftColor,
    ),
    bottom: borderStyle(
      computed.borderBottomStyle,
      computed.borderBottomWidth,
      computed.borderBottomColor,
    ),
    right: borderStyle(
      computed.borderRightStyle,
      computed.borderRightWidth,
      computed.borderRightColor,
    ),
  };
  const visibleBorder =
    borders.top || borders.left || borders.bottom || borders.right;
  if (!visibleBorder) return borders;
  const uniformBorder = {
    style: "thin",
    color: visibleBorder.color || { argb: LINE_COLOR },
  };
  return {
    top: uniformBorder,
    left: uniformBorder,
    bottom: uniformBorder,
    right: uniformBorder,
  };
}

function diagramRowGrid(elements, origin, height, connectors = []) {
  const boundaries = [0, height];
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    boundaries.push(Math.max(0, rect.top - origin.top), Math.min(height, rect.bottom - origin.top));
  }
  for (const { rect, computed } of connectors) {
    boundaries.push(Math.max(0, rect.top - origin.top));
    if (borderStyle(computed.borderLeftStyle, computed.borderLeftWidth, computed.borderLeftColor)) {
      boundaries.push(Math.min(height, rect.bottom - origin.top));
    }
  }
  boundaries.sort((a, b) => a - b);
  const edges = boundaries.filter((value, index) => index === 0 || value - boundaries[index - 1] > 0.01);
  return {
    edges,
    index(value) {
      let low = 0;
      let high = edges.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (edges[middle] < value) low = middle + 1;
        else high = middle;
      }
      return low > 0 && value - edges[low - 1] < edges[low] - value ? low - 1 : low;
    },
  };
}

function gridRange(rect, origin, rowGrid) {
  const left = Math.max(0, rect.left - origin.left);
  const top = Math.max(0, rect.top - origin.top);
  const right = Math.max(left + 1, rect.right - origin.left);
  const bottom = Math.max(top + 1, rect.bottom - origin.top);
  return {
    startColumn: Math.max(1, Math.round(left / COLUMN_PIXELS) + 1),
    endColumn: Math.max(1, Math.round(right / COLUMN_PIXELS)),
    startRow: Math.max(1, rowGrid.index(top) + 1),
    endRow: Math.max(1, rowGrid.index(bottom)),
  };
}

function visibleConnectorRect(element, boundary) {
  const rect = element.getBoundingClientRect();
  const origin = boundary.getBoundingClientRect();
  let left = Math.max(rect.left, origin.left);
  let right = Math.min(rect.right, origin.right);
  let top = Math.max(rect.top, origin.top);
  let bottom = Math.min(rect.bottom, origin.bottom);

  // Excel must respect the overflow clipping that trims connector trunks in the DOM.
  for (let parent = element.parentElement; parent && parent !== boundary; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent);
    const bounds = parent.getBoundingClientRect();
    if (/^(hidden|clip|auto|scroll)$/.test(style.overflowX)) {
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
    if (/^(hidden|clip|auto|scroll)$/.test(style.overflowY)) {
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }

  if (right <= left || bottom <= top) return null;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function setCellBorder(cell, side, value) {
  if (!value) return;
  cell.border = { ...(cell.border || {}), [side]: value };
}

function applyRangeBorders(worksheet, range, borders) {
  for (let column = range.startColumn; column <= range.endColumn; column += 1) {
    setCellBorder(
      worksheet.getCell(range.startRow, column),
      "top",
      borders.top,
    );
    setCellBorder(
      worksheet.getCell(range.endRow, column),
      "bottom",
      borders.bottom,
    );
  }
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    setCellBorder(
      worksheet.getCell(row, range.startColumn),
      "left",
      borders.left,
    );
    setCellBorder(
      worksheet.getCell(row, range.endColumn),
      "right",
      borders.right,
    );
  }
}

function rangesOverlap(first, second) {
  return (
    first.startColumn <= second.endColumn &&
    first.endColumn >= second.startColumn &&
    first.startRow <= second.endRow &&
    first.endRow >= second.startRow
  );
}

function editableValue(element, text) {
  if (
    element.tagName === "TD" &&
    Number(element.cellIndex) >= 2 &&
    /^-?\d+(?:[.,]\d+)?$/.test(text)
  ) {
    return Number(text.replace(",", "."));
  }
  return text;
}

function collectTextElements(content) {
  const elements = new Set();
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = String(walker.currentNode.nodeValue || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const parent = walker.currentNode.parentElement;
    if (
      !parent ||
      parent.closest("svg") ||
      parent.closest('[aria-hidden="true"]')
    )
      continue;
    const element = parent.closest("th, td") || parent;
    if (content.contains(element)) elements.add(element);
  }
  return [...elements]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const computed = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        computed.display !== "none" &&
        computed.visibility !== "hidden"
      );
    })
    .sort((first, second) => {
      const firstRect = first.getBoundingClientRect();
      const secondRect = second.getBoundingClientRect();
      return firstRect.top - secondRect.top || firstRect.left - secondRect.left;
    });
}

function addEditableDiagram({ worksheet, content }) {
  const origin = content.getBoundingClientRect();
  const elements = collectTextElements(content);
  const connectors = [...content.querySelectorAll('[aria-hidden="true"]')]
    .map((element) => ({ rect: visibleConnectorRect(element, content), computed: window.getComputedStyle(element) }))
    .filter(({ rect }) => rect);
  // Use actual DOM row edges so equally tall table rows stay equally tall in Excel.
  const rowGrid = diagramRowGrid(elements, origin, Math.max(content.scrollHeight, origin.height), connectors);
  const columnCount = Math.max(
    1,
    Math.ceil(Math.max(content.scrollWidth, origin.width) / COLUMN_PIXELS) + 1,
  );
  const rowCount = rowGrid.edges.length - 1;
  for (let column = 1; column <= columnCount; column += 1)
    worksheet.getColumn(column).width = 1.15;
  for (let row = 1; row <= rowCount; row += 1)
    worksheet.getRow(row).height = (rowGrid.edges[row] - rowGrid.edges[row - 1]) * 0.75;

  const mergedRanges = [];
  for (const element of elements) {
    const text = String(element.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const range = gridRange(element.getBoundingClientRect(), origin, rowGrid);
    range.endColumn = Math.max(range.startColumn, range.endColumn);
    range.endRow = Math.max(range.startRow, range.endRow);
    if (mergedRanges.some((existing) => rangesOverlap(existing, range)))
      continue;

    const computed = window.getComputedStyle(element);
    const borders = elementBorders(computed);
    if (
      range.startColumn !== range.endColumn ||
      range.startRow !== range.endRow
    ) {
      worksheet.mergeCells(
        range.startRow,
        range.startColumn,
        range.endRow,
        range.endColumn,
      );
    }
    applyRangeBorders(worksheet, range, borders);
    mergedRanges.push(range);
    const cell = worksheet.getCell(range.startRow, range.startColumn);
    cell.value = editableValue(element, text);
    const background = nearestBackground(element, content);
    if (background)
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: background },
      };
    cell.font = {
      name: "Arial",
      size: Math.max(
        6,
        Math.min(16, Number.parseFloat(computed.fontSize || "10") * 0.75),
      ),
      bold: Number.parseInt(computed.fontWeight || "400", 10) >= 600,
      italic: computed.fontStyle === "italic",
      color: { argb: colorToArgb(computed.color) || "FF0F172A" },
    };
    cell.alignment = {
      horizontal: ["center", "right"].includes(computed.textAlign)
        ? computed.textAlign
        : "left",
      vertical: "middle",
      wrapText: true,
      shrinkToFit: true,
    };
    if (borders.top || borders.left || borders.bottom || borders.right)
      cell.border = borders;
  }

  const commandLine = { style: "thin", color: { argb: LINE_COLOR } };
  const isTextCell = (row, column) => mergedRanges.some((range) =>
    row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn);
  for (const { rect, computed } of connectors) {
    const range = gridRange(rect, origin, rowGrid);
    if (
      borderStyle(
        computed.borderTopStyle,
        computed.borderTopWidth,
        computed.borderTopColor,
      )
    ) {
      for (
        let column = range.startColumn;
        column <= Math.max(range.startColumn, range.endColumn);
        column += 1
      ) {
        if (isTextCell(range.startRow, column)) continue;
        setCellBorder(
          worksheet.getCell(range.startRow, column),
          "top",
          commandLine,
        );
      }
    }
    if (
      borderStyle(
        computed.borderLeftStyle,
        computed.borderLeftWidth,
        computed.borderLeftColor,
      )
    ) {
      for (
        let row = range.startRow;
        row <= Math.max(range.startRow, range.endRow);
        row += 1
      ) {
        if (isTextCell(row, range.startColumn)) continue;
        setCellBorder(
          worksheet.getCell(row, range.startColumn),
          "left",
          commandLine,
        );
      }
    }
  }

  worksheet.views = [{ showGridLines: false }];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
  };
  worksheet.pageMargins = {
    left: 0.2,
    right: 0.2,
    top: 0.3,
    bottom: 0.3,
    header: 0,
    footer: 0,
  };
  return { columnCount, rowCount };
}

function addDetailWorksheet(workbook, data, group) {
  const detail = workbook.addWorksheet("Data Detail", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headers = [
    "No.",
    "Nomenklatur ORB/Pergub",
    "KL ORB",
    "Nomenklatur Menpan",
    "KL Menpan",
    "Atasan Langsung",
    "Rumpun Jabatan",
    "Bezetting",
    "Kebutuhan",
    "Selisih (B-K)",
    "Jenis Data",
    "UKPD",
  ];
  detail.addRow(headers);
  (data.positions || []).forEach((position, index) => {
    const bezetting =
      Number(
        group === "ASN" ? position.bezetting_asn : position.bezetting_non_asn,
      ) || 0;
    const kebutuhan =
      Number(
        group === "ASN" ? position.kebutuhan_asn : position.kebutuhan_non_asn,
      ) || 0;
    detail.addRow([
      index + 1,
      position.nama_jabatan_orb || "",
      position.kelas_jabatan_orb || "",
      position.nama_jabatan_menpan || "",
      position.kelas_jabatan_menpan || "",
      position.atasan_langsung || "",
      position.rumpun_jabatan || "",
      bezetting,
      kebutuhan,
      bezetting - kebutuhan,
      group === "ASN" ? "ASN/PNS" : "Non-ASN",
      data.selectedUkpd || data.template || "",
    ]);
  });
  detail.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0A2540" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });
  detail.columns.forEach((column, index) => {
    column.width = Math.min(
      55,
      Math.max(
        index === 0 ? 7 : 12,
        ...column.values
          .slice(1)
          .map((value) => String(value || "").length + 2),
      ),
    );
  });
  detail.eachRow((row, rowNumber) => {
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber > 1 && rowNumber % 2 === 0)
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F5F9" },
        };
      });
  });
  detail.autoFilter = { from: "A1", to: "L1" };
}

export function createEditablePetaWorkbook({ ExcelJS, content, data, group }) {
  if (!content) throw new Error("Bagan Peta Jabatan belum tersedia.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SMART SDMK Dinas Kesehatan Provinsi DKI Jakarta";
  workbook.created = new Date();
  const diagram = workbook.addWorksheet("Bagan Peta Jabatan");
  addEditableDiagram({ worksheet: diagram, content });
  if (["RSUD A", "RSUD B", "RSKD"].includes(data?.template)) {
    diagram.pageSetup.paperSize = 9;
    diagram.pageSetup.fitToHeight = 2;
    diagram.pageSetup.pageOrder = "downThenOver";
  }
  addDetailWorksheet(workbook, data, group);
  return workbook;
}
