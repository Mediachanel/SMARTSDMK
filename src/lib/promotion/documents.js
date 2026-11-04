import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { check,problem,canEdit,canVerify,periodOpen,contextFor,effectiveRequirements } from './policy.js';
import { actor,audit,getSubmission,loadInput,documentRows } from './repository.js';
import { validatePdf,readDocument,scanDocument,FIELDS } from './reader.js';

export function storageRoot() {
  return path.resolve(process.env.PROMOTION_STORAGE_ROOT || '/usb-uploads/kenaikan-pangkat');
}
export function documentPath(key) {
  check(/^([1-9][0-9]*\/)?[a-f0-9-]{36}\.pdf$/.test(key || ''),'Identitas dokumen tidak valid.');
  return path.join(storageRoot(),key);
}
export async function ensureStorage() {
  try { await fs.access(path.join(storageRoot(),'.smart-hrm-usb-storage')); }
  catch { throw problem('Volume penyimpanan dokumen KP belum terpasang.',503); }
}
export async function prepareUpload(file,submissionId) {
  await ensureStorage();
  check(file && typeof file.arrayBuffer==='function','Pilih berkas PDF.');
  check(file.size>0 && file.size<=10*1024*1024,'Ukuran maksimal 10 MB.',413);
  const buffer=Buffer.from(await file.arrayBuffer());validatePdf(file,buffer);
  const key=`${submissionId}/${randomUUID()}.pdf`,filename=documentPath(key);
  await fs.mkdir(path.dirname(filename),{recursive:true});
  await fs.writeFile(filename,buffer,{flag:'wx',mode:0o600});
  try { await scanDocument(filename);return {key,filename,size:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex'),extraction:await readDocument(filename,key)}; }
  catch(error) { await fs.unlink(filename).catch(()=>{});throw error; }
}
export async function saveUpload(db,user,id,requirementId,replaceId,prepared,request) {
  const item=await getSubmission(db,user,id,true),input=await loadInput(db,item);
  const requirement=effectiveRequirements(input.requirements,contextFor(item,input.employee,input.type,input.period)).find(r=>r.id===requirementId);
  check(requirement,'Persyaratan dokumen tidak berlaku untuk usulan ini.');
  const finalSk=canVerify(user,item) && item.status==='DISETUJUI' && requirement.code==='SK_KP_TERBIT';
  check(finalSk || canEdit(user,item),'Dokumen tidak dapat diubah pada tahap ini.',403);
  if(!finalSk) check(periodOpen(input.period),'Batas unggah UKPD sudah ditutup.');
  if(replaceId) {
    const previous=input.documents.find(d=>d.id===replaceId && d.requirement_id===requirementId);
    check(previous,'Dokumen yang akan diganti tidak sesuai.');
    await db.query('UPDATE promotion_documents SET active=false WHERE id=?',[replaceId]);
  }
  const [insert]=await db.query('INSERT INTO promotion_documents(submission_id,requirement_id,storage_key,name,size,sha256,uploaded_by) VALUES(?,?,?,?,?,?,?)',[id,requirementId,prepared.key,`${requirement.code}-${id}.pdf`,prepared.size,prepared.sha256,actor(user)]);
  const extracted=prepared.extraction;
  for(const f of Object.values(extracted.extracted_document_data)) f.source_document=insert.insertId;
  await db.query('INSERT INTO promotion_document_extractions(document_id,extracted_document_data,extraction_method,status) VALUES(?,?::jsonb,?,?)',[insert.insertId,JSON.stringify(extracted.extracted_document_data),extracted.extraction_method,extracted.status]);
  await db.query('UPDATE promotion_submissions SET revision=revision+1,verified_revision=NULL,updated_at=now() WHERE id=?',[id]);
  await audit(db,user,replaceId?'replace_document':'upload',id,replaceId?{document_id:replaceId}:null,{document_id:insert.insertId,size:prepared.size},request);
  return {id:insert.insertId,status:extracted.status};
}
export async function documentAction(db,user,id,data,request) {
  const item=await getSubmission(db,user,id,true),input=await loadInput(db,item);
  const doc=input.documents.find(d=>d.id===data.document_id);check(doc,'Dokumen tidak dapat diakses.',403);
  if(data.action==='delete') {
    check(canEdit(user,item),'Dokumen tidak dapat dihapus.',403);check(periodOpen(input.period),'Batas unggah telah ditutup.');
    await db.query('UPDATE promotion_documents SET active=false WHERE id=?',[doc.id]);
  } else {
    check(canVerify(user,item),'Tidak berwenang memeriksa dokumen.',403);
    check(['MENUNGGU_VERIFIKASI_SUDIN','MENUNGGU_VERIFIKASI_DINKES','SMART_VALIDATION','DIUSULKAN_KE_BKD','DIUSULKAN_KE_BKN','DISETUJUI','SK_TERBIT','MASUK_REKAP_PERIODE'].includes(item.status),'Dokumen tidak dapat diverifikasi pada tahap ini.',409);
    if(data.action==='review') {
      check(data.note?.trim(),'Catatan pemeriksaan manual wajib diisi.');
      const fields={};
      for(const [key,field] of Object.entries(data.fields || {})) {
        check(FIELDS.includes(key) && Number.isInteger(field.page) && field.page>=1 && field.page<=30,'Field atau halaman tidak valid.');
        check(typeof field.extracted_value==='string' || typeof field.extracted_value==='number','Nilai ekstraksi tidak valid.');
        fields[key]={extracted_value:field.extracted_value,page:field.page,confidence:1,source_document:doc.id,extraction_method:'MANUAL_REVIEW'};
      }
      check(Object.keys(fields).length,'Isi hasil pemeriksaan manual.');
      await db.query("INSERT INTO promotion_document_extractions(document_id,extracted_document_data,extraction_method,status,reviewed_by,review_note) VALUES(?,?::jsonb,'MANUAL_REVIEW','REVIEWED',?,?)",[doc.id,JSON.stringify(fields),actor(user),data.note]);
      await db.query('UPDATE promotion_documents SET verified_by=NULL,verified_at=NULL WHERE id=?',[doc.id]);
    } else {
      check(data.action==='verify','Aksi dokumen tidak dikenal.');
      check(['EXTRACTED','REVIEWED'].includes(doc.extraction_status),'Periksa hasil pembacaan manual terlebih dahulu.');
      await db.query('UPDATE promotion_documents SET verified_by=?,verified_at=now() WHERE id=?',[actor(user),doc.id]);
    }
  }
  await db.query('UPDATE promotion_submissions SET revision=revision+1,verified_revision=NULL,updated_at=now() WHERE id=?',[id]);
  await audit(db,user,`${data.action}_document`,id,{document_id:doc.id},{document_id:doc.id,note:data.note || null},request);
  return {id:doc.id};
}
export async function getDocument(db,user,id,documentId,request) {
  await getSubmission(db,user,id);
  const docs=await documentRows(db,id);check(docs.some(d=>d.id===documentId),'Dokumen tidak dapat diakses.',403);
  const [rows]=await db.query('SELECT storage_key,name FROM promotion_documents WHERE id=? AND submission_id=? AND active=true',[documentId,id]);
  await ensureStorage();
  let buffer;
  try { buffer=await fs.readFile(documentPath(rows[0].storage_key)); } catch { throw problem('Dokumen tidak tersedia pada volume penyimpanan.',404); }
  await audit(db,user,'read_document',id,null,{document_id:documentId},request);
  return {buffer,name:rows[0].name};
}
