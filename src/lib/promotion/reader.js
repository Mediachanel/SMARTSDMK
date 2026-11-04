import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { check,problem } from './policy.js';
import { dateValue } from './eligibility.js';
const exec = promisify(execFile);
export const MAX_BYTES = 10 * 1024 * 1024;
export const FIELDS = ['nama','nip','nomor_sk','tanggal_sk','pangkat','tmt_pangkat','jabatan','jenjang','tmt_jabatan','periode_awal','periode_akhir','angka_kredit_awal','angka_kredit_baru','angka_kredit_tambahan','total_angka_kredit','tanggal_pak','pejabat_penetap','nilai_skp','tahun_skp'];
const LABELS = {
  nama:'nama',nip:'n[.]?i[.]?p[.]?',nomor_sk:'nomor(?: sk)?',tanggal_sk:'tanggal sk',pangkat:'(?:pangkat(?: / golongan)?|golongan)',
  tmt_pangkat:'tmt pangkat',jabatan:'jabatan',jenjang:'jenjang(?: jabatan)?',tmt_jabatan:'tmt jabatan',
  periode_awal:'(?:periode awal|awal penilaian)',periode_akhir:'(?:periode akhir|akhir penilaian)',
  angka_kredit_awal:'(?:angka kredit awal|angka kredit lama)',angka_kredit_baru:'angka kredit baru',angka_kredit_tambahan:'angka kredit tambahan',
  total_angka_kredit:'(?:total angka kredit|jumlah angka kredit)',tanggal_pak:'tanggal pak',pejabat_penetap:'pejabat penetap',nilai_skp:'(?:nilai skp|predikat skp)',tahun_skp:'tahun skp'
};

function parseCreditNumber(value) {
  let text = String(value || '').trim().replace(/[^0-9,.-]/g,'');
  if (!text || !/[0-9]/.test(text)) return null;
  text = text.replace(/^-/, '');
  const lastComma = text.lastIndexOf(','), lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousand = decimal === ',' ? '.' : ',';
    text = text.replaceAll(thousand,'').replace(decimal,'.');
  } else if (lastComma >= 0) {
    const tail = text.length - lastComma - 1;
    text = tail === 3 && text.slice(0,lastComma).length > 3 ? text.replaceAll(',','') : text.replace(',','.');
  } else if (lastDot >= 0) {
    const tail = text.length - lastDot - 1;
    if (tail === 3 && text.slice(0,lastDot).length > 3) text = text.replaceAll('.','');
  }
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function creditFieldFromLine(line) {
  const text = line.toLowerCase();
  if (!/(angka\s*kredit|\bpak\b|konversi)/i.test(line)) return null;
  if (/(total|jumlah|kumulatif)/.test(text)) return 'total_angka_kredit';
  if (/(baru|hasil|konversi)/.test(text)) return 'angka_kredit_baru';
  if (/(tambahan|penambahan)/.test(text)) return 'angka_kredit_tambahan';
  if (/(awal|lama|sebelum)/.test(text)) return 'angka_kredit_awal';
  return null;
}
function inferCreditFieldsFromText(text, page, sourceDocument) {
  const fields = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const field = creditFieldFromLine(rawLine);
    if (!field) continue;
    const matches = [...rawLine.matchAll(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g)].map(m=>m[0]);
    if (!matches.length) continue;
    const value = parseCreditNumber(matches.at(-1));
    if (value === null) continue;
    fields[field] = {extracted_value:value,confidence:Math.min(page.confidence,0.9),page:page.page,source_document:sourceDocument,extraction_method:page.method};
  }
  return fields;
}

export function validatePdf(file,buffer) {
  check(file && /\.pdf$/i.test(file.name || '') && file.type === 'application/pdf','Dokumen wajib PDF dengan MIME application/pdf.');
  check(buffer.length > 0 && buffer.length <= MAX_BYTES,'Ukuran PDF maksimal 10 MB.',413);
  check(buffer.subarray(0,5).toString() === '%PDF-','Signature berkas bukan PDF.');
}
function normalizeExtracted(field,value) {
  let text = value.trim();
  if (field==='nip') { text = text.replace(/[ .-]/g,''); return /^\d{18}$/.test(text) ? text : null; }
  if (field.startsWith('angka_') || field === 'total_angka_kredit') {
    return parseCreditNumber(text);
  }
  if (field.startsWith('tanggal') || field.startsWith('tmt') || field.startsWith('periode')) {
    const months = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];
    const m = text.toLowerCase().match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
    if (m && months.includes(m[2])) text=`${m[3]}-${String(months.indexOf(m[2])+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return dateValue(text);
  }
  return text.slice(0,300);
}
export function extractFields(pages,sourceDocument) {
  const fields = {};
  let ambiguous = false;
  for (const page of pages) {
    for (const [key,field] of Object.entries(inferCreditFieldsFromText(page.text,page,sourceDocument))) {
      if (!fields[key]) fields[key]=field;
    }
    for (const [field,label] of Object.entries(LABELS)) {
      const re = new RegExp(`^\\s*${label}\\s*[:=]\\s*(.+)$`,'gim');
      for (const match of page.text.matchAll(re)) {
        const value = normalizeExtracted(field,match[1]);
        if (value === null) { ambiguous=true; continue; }
        if (fields[field] && String(fields[field].extracted_value) !== String(value)) { fields[field].confidence=0; ambiguous=true; continue; }
        fields[field] = fields[field] || {extracted_value:value,confidence:Math.min(page.confidence,0.95),page:page.page,source_document:sourceDocument,extraction_method:page.method};
      }
    }
  }
  return { fields,status:ambiguous || !Object.keys(fields).length || Object.values(fields).some(f=>f.confidence<0.9) ? 'MANUAL_REVIEW_REQUIRED':'EXTRACTED' };
}
export class DocumentReader { async read() { throw new Error('Implement DocumentReader.read'); } }
export class PDFTextReader extends DocumentReader {
  async read(filename) {
    const {stdout} = await exec(process.env.PROMOTION_PDFTOTEXT || 'pdftotext',['-layout','-enc','UTF-8',filename,'-'],{timeout:30000,maxBuffer:4*1024*1024,windowsHide:true});
    const texts=stdout.split('\f');
    if (!texts.at(-1)?.trim()) texts.pop();
    check(texts.length <= 30,'PDF maksimal 30 halaman.');
    return texts.map((text,i)=>({text,page:i+1,method:'PDF_TEXT',confidence:0.95}));
  }
}
export class OCRReader extends DocumentReader {
  async read(filename,pageNumber) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(),'smart-kp-ocr-'));
    try {
      const output = path.join(directory,'page');
      await exec(process.env.PROMOTION_PDFTOPPM || 'pdftoppm',['-f',String(pageNumber),'-l',String(pageNumber),'-scale-to','2500','-singlefile','-png',filename,output],{timeout:30000,maxBuffer:1024*1024,windowsHide:true});
      const {stdout} = await exec(process.env.PROMOTION_TESSERACT || 'tesseract',[`${output}.png`,'stdout','-l',process.env.PROMOTION_OCR_LANG || 'ind+eng','tsv'],{timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
      const lines=new Map(); const confidence=[];
      for (const line of stdout.split(/\r?\n/).slice(1)) {
        const cells=line.split('\t');
        if(cells[0] !== '5' || !cells[11]?.trim()) continue;
        const key=cells.slice(1,5).join(':');
        lines.set(key,`${lines.get(key) || ''} ${cells[11]}`.trim());
        confidence.push(Math.max(0,Number(cells[10]))/100);
      }
      return {text:[...lines.values()].join('\n'),page:pageNumber,method:'OCR_TESSERACT',confidence:confidence.length ? Math.min(...confidence):0};
    } finally { await fs.rm(directory,{recursive:true,force:true}); }
  }
}
export async function readDocument(filename,id,{textReader=new PDFTextReader(),ocrReader=new OCRReader()}={}) {
  try {
    const pages=await textReader.read(filename);
    for(let i=0;i<pages.length;i++) if(pages[i].text.trim().length<25) pages[i]=await ocrReader.read(filename,pages[i].page);
    const result=extractFields(pages,id);
    return {extracted_document_data:result.fields,status:result.status,extraction_method:pages.some(p=>p.method==='OCR_TESSERACT')?'PDF_TEXT_OCR':'PDF_TEXT'};
  } catch(error) {
    if(error.public) throw error;
    return {extracted_document_data:{},status:'MANUAL_REVIEW_REQUIRED',extraction_method:'READER_UNAVAILABLE'};
  }
}
export async function scanDocument(filename) {
  try { await exec(process.env.PROMOTION_SCAN_COMMAND || 'clamscan',['--no-summary',filename],{timeout:45000,maxBuffer:1024*1024,windowsHide:true}); }
  catch(error) {
    if(error.code === 1) throw problem('Dokumen ditolak oleh pemindaian keamanan.');
    throw problem('Pemindai dokumen lokal belum tersedia. Hubungi pengelola server.',503);
  }
}
