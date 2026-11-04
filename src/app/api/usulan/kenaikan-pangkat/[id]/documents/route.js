import fs from 'node:fs/promises';
import { z } from 'zod';
import { route,body,positiveId,boundedBytes } from '@/lib/promotion/api';
import { getSubmission } from '@/lib/promotion/repository';
import { check,canEdit,canVerify } from '@/lib/promotion/policy';
import { prepareUpload,saveUpload,documentAction,getDocument } from '@/lib/promotion/documents';
export const runtime='nodejs';
export async function GET(request,{params}) { return route(request,async(db,user)=>{
  const id=positiveId.parse((await params).id),documentId=positiveId.parse(new URL(request.url).searchParams.get('document_id'));
  const {buffer,name}=await getDocument(db,user,id,documentId,request);
  return new Response(buffer,{headers:{'Content-Type':'application/pdf','Content-Length':String(buffer.length),'Content-Disposition':`inline; filename="${name.replace(/[^a-zA-Z0-9_.-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
}); }
export async function POST(request,{params}) {
  let prepared;
  const response=await route(request,async(db,user)=>{
    const id=positiveId.parse((await params).id),item=await getSubmission(db,user,id);
    check(canEdit(user,item) || (canVerify(user,item) && item.status==='DISETUJUI'),'Tidak berwenang mengunggah dokumen.',403);
    check(Number(request.headers.get('content-length') || 0)<=11*1024*1024,'Permintaan terlalu besar.',413);
    const bytes=await boundedBytes(request,11*1024*1024);
    let form;
    try { form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type') || ''}}).formData(); }
    catch { check(false,'Form upload tidak valid.'); }
    const requirementId=positiveId.parse(form.get('requirement_id'));
    const replaceId=form.get('replace_id')?positiveId.parse(form.get('replace_id')):null;
    prepared=await prepareUpload(form.get('file'),id);
    return saveUpload(db,user,id,requirementId,replaceId,prepared,request);
  });
  if(!response.ok && prepared) await fs.unlink(prepared.filename).catch(()=>{});
  return response;
}
export async function PATCH(request,{params}) { return route(request,async(db,user)=>{
  const data=await body(request,z.object({action:z.enum(['delete','review','verify']),document_id:positiveId,note:z.string().max(3000).optional(),fields:z.record(z.object({extracted_value:z.union([z.string().max(500),z.number().finite()]),page:z.number().int().min(1).max(30)}).strict()).optional()}).strict());
  return documentAction(db,user,positiveId.parse((await params).id),data,request);
}); }
