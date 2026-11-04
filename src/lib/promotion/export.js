import ExcelJS from 'exceljs';

export const RECAP_COLUMNS=[['Nama','nama'],['NIP','nip'],['Pendidikan terakhir','jenjang_pendidikan'],['Golongan lama','pangkat_golongan'],['TMT lama','tmt_pangkat_terakhir'],['Golongan baru','proposed_rank'],['TMT baru','effective_date'],['Jabatan terakhir','jabatan'],['Jenjang jabatan','jenjang'],['TMT jabatan','tmt_jabatan'],['Atasan langsung','struktur_atasan_langsung'],['Unit kerja','nama_ukpd'],['Jenis kenaikan pangkat','type_name'],['Angka kredit','angka_kredit'],['Hasil pemeriksaan sistem','validation'],['Status','status']];

const MONTHS=['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
const HEADER_FILL={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9EAD3'}};
const BORDER={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};

function valueOf(field) { return field?.extracted_value ?? ''; }
function normalizeRank(value='') {
  const text=String(value || '');
  return text.match(/\(([^)]+)\)/)?.[1] || text;
}
function excelDate(value) {
  if(!value) return '';
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}
function monthLabel(period) {
  const date=new Date(`${period?.effective_date || ''}T00:00:00`);
  if(Number.isNaN(date.getTime())) return 'PERIODE';
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
function isAboveIvB(item) { return /\bIV\/(?:b|c|d|e)\b/i.test(item.proposed_rank || ''); }
function splitGroups(items) {
  return [
    {label:'GOLONGAN DIBAWAH IV-B',items:items.filter(item=>!isAboveIvB(item))},
    {label:'GOLONGAN DIATAS IV-B',items:items.filter(isAboveIvB)}
  ].filter(group=>group.items.length);
}
function docFields(item,codes) {
  const docs=(item.documents || []).filter(d=>codes.includes(d.code));
  return docs.reduce((acc,doc)=>({...acc,...(doc.extracted_document_data || {})}),{});
}
function creditValue(item) {
  const fields=docFields(item,['PAK','KONVERSI_AK']);
  return valueOf(fields.total_angka_kredit) || valueOf(fields.angka_kredit_baru) || valueOf(fields.angka_kredit_tambahan) || '';
}
function typeName(item) { return item.type?.name || item.promotion_type || ''; }
function rowModel(item) {
  const employee=item.employee || item.employee_snapshot || {};
  return {
    ...employee,
    proposed_rank:item.proposed_rank,
    effective_date:item.period?.effective_date,
    type_name:typeName(item),
    angka_kredit:creditValue(item),
    validation:item.run?.overall_status || 'Belum diperiksa',
    status:item.status,
    atasan:employee.struktur_atasan_langsung || employee.atasan_langsung || '',
    gol_atasan:employee.golongan_atasan_langsung || employee.pangkat_atasan_langsung || ''
  };
}
export function recapRows(items) { return items.map(rowModel); }

function styleTitle(cell) { cell.font={bold:true,size:12};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true}; }
function styleHeader(cell) { cell.font={bold:true};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};cell.fill=HEADER_FILL;cell.border=BORDER; }
function styleData(cell) { cell.alignment={vertical:'middle',wrapText:true};cell.border=BORDER; }
function setWidths(ws,widths) { widths.forEach((width,i)=>{ws.getColumn(i+1).width=width;}); }
function colNumber(col) { return col.split('').reduce((sum,ch)=>sum*26+ch.charCodeAt(0)-64,0); }
function decodeCell(ref) { const [,col,row]=ref.match(/^([A-Z]+)(\d+)$/);return {col:colNumber(col),row:Number(row)}; }
function applyRange(ws,range,styler) {
  const [start,end]=range.split(':').map(decodeCell);
  for(let row=start.row;row<=end.row;row++) for(let col=start.col;col<=end.col;col++) styler(ws.getCell(row,col));
}
function mergeAndStyle(ws,range,styler) { ws.mergeCells(range);applyRange(ws,range,styler); }
function setupPrint(ws,lastColumn) {
  ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,printArea:`A1:${lastColumn}${ws.rowCount}`};
  ws.pageMargins={left:0.25,right:0.25,top:0.5,bottom:0.5,header:0.2,footer:0.2};
}

function addUsulanHeader(ws,row,label,period) {
  mergeAndStyle(ws,`A${row}:P${row}`,styleTitle);mergeAndStyle(ws,`A${row+1}:P${row+1}`,styleTitle);
  ws.getCell(`A${row}`).value=`DAFTAR USUL KENAIKAN PANGKAT PERIODE ${monthLabel(period)} ${label}`;
  ws.getCell(`A${row+1}`).value='PEGAWAI DINAS KESEHATAN PROVINSI DAERAH KHUSUS IBUKOTA JAKARTA DAN JAJARAN';
  ws.getRow(row+2).values=['No','Nama','NIP','Pendidikan \nTerakhir','Diklatpim\nSTLUPI/PP\nSTLUD','Golongan \nLama',null,'Masa Kerja \nGol Lama',null,'Golongan \nBaru',null,'Jabatan Terakhir','Jabatan Atasan Langsung','Gol\nAtasan \nLangsung','Unit Kerja','Jenis Kenaikan Pangkat'];
  ws.getRow(row+3).values=[null,null,null,null,null,'Gol','TMT','Thn','Bln','Gol','TMT',null,null,null,null,null];
  ws.getRow(row+4).values=Array.from({length:16},(_,i)=>i+1);
  [`A${row+2}:A${row+3}`,`B${row+2}:B${row+3}`,`C${row+2}:C${row+3}`,`D${row+2}:D${row+3}`,`E${row+2}:E${row+3}`,`F${row+2}:G${row+2}`,`H${row+2}:I${row+2}`,`J${row+2}:K${row+2}`,`L${row+2}:L${row+3}`,`M${row+2}:M${row+3}`,`N${row+2}:N${row+3}`,`O${row+2}:O${row+3}`,`P${row+2}:P${row+3}`].forEach(r=>mergeAndStyle(ws,r,styleHeader));
  [row+2,row+3,row+4].forEach(r=>applyRange(ws,`A${r}:P${r}`,styleHeader));
  ws.getRow(row).height=24;ws.getRow(row+1).height=24;ws.getRow(row+2).height=80;ws.getRow(row+3).height=22;ws.getRow(row+4).height=22;
  return row+5;
}
function addUsulanRows(ws,items,startRow) {
  items.map(rowModel).forEach((r,i)=>{
    const row=ws.getRow(startRow+i);
    row.values=[i+1,r.nama,r.nip,r.jenjang_pendidikan || '-', '-', normalizeRank(r.pangkat_golongan), excelDate(r.tmt_pangkat_terakhir), {formula:`DATEDIF(G${startRow+i},NOW(),"y")`}, {formula:`DATEDIF(G${startRow+i},NOW(),"ym")`}, normalizeRank(r.proposed_rank), excelDate(r.effective_date), r.jabatan || '-', r.atasan || '-', r.gol_atasan || '-', r.nama_ukpd || '-', r.type_name || '-'];
    row.eachCell(styleData);
    row.getCell(7).numFmt='dd/mm/yyyy'; row.getCell(11).numFmt='dd/mm/yyyy';
    row.height=49.5;
  });
  return startRow+items.length;
}
function addUsulanSheet(workbook,items,period) {
  const ws=workbook.addWorksheet(`FORMAT USULAN ${monthLabel(period)}`.slice(0,31));
  setWidths(ws,[7.71,40,29.43,25.29,18.14,8.29,15.57,7.86,8.57,6.43,15.14,32.14,31.14,15.57,25.71,36.14]);
  let row=5;
  for(const group of splitGroups(items)) {
    row=addUsulanHeader(ws,row,group.label,period);
    row=addUsulanRows(ws,group.items,row)+2;
  }
  ws.views=[{state:'frozen',ySplit:7,topLeftCell:'A8'}];
  setupPrint(ws,'P');
}

function addBaHeader(ws,row,label,period) {
  mergeAndStyle(ws,`A${row}:G${row}`,styleTitle);mergeAndStyle(ws,`A${row+1}:G${row+1}`,styleTitle);
  ws.getCell(`A${row}`).value=`BERITA ACARA PENERIMAAN KENAIKAN PANGKAT PERIODE ${monthLabel(period)} ${label}`;
  ws.getCell(`A${row+1}`).value='PEGAWAI DINAS KESEHATAN PROVINSI DAERAH KHUSUS IBUKOTA JAKARTA DAN JAJARAN';
  ws.getRow(row+2).values=['No','Nama','NIP','Unit Kerja','Nama Yang Menerima','Tanggal','Tanda Tangan'];
  ws.getRow(row+4).values=[1,2,3,4,5,6,7];
  [row+2,row+4].forEach(r=>applyRange(ws,`A${r}:G${r}`,styleHeader));
  ws.getRow(row).height=24;ws.getRow(row+1).height=24;ws.getRow(row+2).height=32;ws.getRow(row+4).height=22;
  return row+5;
}
function addBeritaAcaraSheet(workbook,items,period) {
  const ws=workbook.addWorksheet(`BA KP ${monthLabel(period)}`.slice(0,31));
  setWidths(ws,[7.71,40,29.43,28.86,31.57,20,17.14]);
  let row=1;
  for(const group of splitGroups(items)) {
    row=addBaHeader(ws,row,group.label,period);
    group.items.map(rowModel).forEach((r,i)=>{
      const dataRow=ws.getRow(row+i);
      dataRow.values=[i+1,r.nama,r.nip,r.nama_ukpd || '', '', '', ''];
      dataRow.eachCell(styleData);
      dataRow.height=49.5;
    });
    row+=group.items.length+2;
  }
  ws.views=[{state:'frozen',ySplit:5}];
  setupPrint(ws,'G');
}

export async function buildPromotionWorkbook(items,batch) {
  const workbook=new ExcelJS.Workbook();
  workbook.creator='SMART SDMK';
  workbook.created=new Date();
  const period=items[0]?.period || {effective_date:batch?.effective_date};
  addUsulanSheet(workbook,items,period);
  addBeritaAcaraSheet(workbook,items,period);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
