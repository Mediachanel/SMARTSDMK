import fs from 'node:fs';
import { Readable } from 'node:stream';
import archiver from 'archiver';
import { route,positiveId } from '@/lib/promotion/api';
import { periodRecap,recap } from '@/lib/promotion/service';
import { detail } from '@/lib/promotion/repository';
import { buildPromotionWorkbook } from '@/lib/promotion/export';
import { documentPath,ensureStorage } from '@/lib/promotion/documents';

export const runtime='nodejs';

function safePart(value,fallback='DATA') {
  return String(value || fallback).replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120) || fallback;
}
function zipName(result) {
  const base=result.batch?.code || `KP-${result.batch?.id || 'DOKUMEN'}`;
  return `${safePart(base)}-DOKUMEN-LENGKAP.zip`;
}
function documentName(doc,index) {
  const prefix=String(index+1).padStart(2,'0');
  return `${prefix}-${safePart(doc.code || doc.label || 'DOKUMEN')}-${safePart(doc.name || doc.label || 'dokumen.pdf')}`;
}
async function appendDocuments(zip,items) {
  await ensureStorage();
  let count=0;
  for(const item of items) {
    const employee=item.employee || item.employee_snapshot || {};
    const ukpd=safePart(employee.nama_ukpd || 'UKPD');
    const pegawai=safePart(`${employee.nip || employee.nrk || item.id} - ${employee.nama || 'Pegawai'}`);
    item.documents?.forEach((doc,index)=>{
      if(!doc.storage_key) return;
      const file=documentPath(doc.storage_key);
      if(!fs.existsSync(file)) return;
      zip.file(file,{name:`${ukpd}/${pegawai}/${documentName(doc,index)}`});
      count++;
    });
  }
  return count;
}

export async function GET(request) { return route(request,async(db,user)=>{
  const params=new URL(request.url).searchParams;
  const result=params.get('id')
    ? {batch:{id:params.get('id'),code:`KP-${params.get('id')}`},items:[await detail(db,user,positiveId.parse(params.get('id')))]}
    : params.get('period_id')
      ? await periodRecap(db,user,positiveId.parse(params.get('period_id')),request)
      : await recap(db,user,positiveId.parse(params.get('batch_id')),request);
  const workbook=await buildPromotionWorkbook(result.items,result.batch);
  const zip=archiver('zip',{zlib:{level:9},forceZip64:true});
  const output=Readable.toWeb(zip);
  zip.append(workbook,{name:'REKAP-KENAIKAN-PANGKAT.xlsx'});
  const documentCount=await appendDocuments(zip,result.items);
  zip.append(`Jumlah dokumen PDF yang ditemukan: ${documentCount}\n`,{name:'INFO.txt'});
  zip.finalize();
  return new Response(output,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${zipName(result)}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}); }
