import { z } from 'zod';
import { requireAuth } from '@/lib/auth/requireAuth';
import { getConnectedPool } from '../db/postgres.js';
import { fail,ok } from '@/lib/helpers/response';
import { transaction,userContext } from './repository.js';
import { MODULE_ROLES,check } from './policy.js';
import { enforceRateLimit } from '@/lib/security/rateLimit';
export const positiveId=z.coerce.number().int().positive();
export const createSchema=z.object({id_pegawai:positiveId,period_id:positiveId,type_id:positiveId,proposed_rank:z.string().trim().min(1).max(120)}).strict();
export const actionSchema=z.object({action:z.enum(['edit','submit','validate','return','approve','ready','acknowledge','send_bkd','send_bkn','return_bkd','return_bkn','accept','issue_sk','finish','reject','confirm_review']),revision:z.number().int().positive().optional(),proposed_rank:z.string().trim().min(1).max(120).optional(),note:z.string().trim().max(3000).optional(),result_id:positiveId.optional(),reason_id:positiveId.optional(),returned_at:z.string().datetime({offset:true}).optional(),subcategory:z.string().max(200).optional(),document_id:positiveId.optional()}).strict().refine(d=>d.action!=='edit' || d.proposed_rank,{message:'Pangkat usulan wajib.'});
export const batchSchema=z.object({action:z.enum(['validate','recap']),ids:z.array(positiveId).min(1).max(50)}).strict();
export async function boundedBytes(request,maxBytes) {
  check(Number(request.headers.get('content-length') || 0)<=maxBytes,'Permintaan terlalu besar.',413);
  const reader=request.body?.getReader();if(!reader) return Buffer.alloc(0);
  const chunks=[];let size=0;
  try { for(;;) { const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>maxBytes) {await reader.cancel();check(false,'Permintaan terlalu besar.',413);}chunks.push(Buffer.from(value)); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks,size);
}
export async function body(request,schema) {
  const raw=(await boundedBytes(request,128*1024)).toString('utf8');
  let data;try { data=JSON.parse(raw); } catch { check(false,'JSON tidak valid.'); }
  const parsed=schema.safeParse(data);check(parsed.success,'Data permintaan tidak valid.');return parsed.data;
}
export async function route(request,fn) {
  const {user:session,error}=await requireAuth(MODULE_ROLES,request);if(error) return error;
  if(request.method==='POST' && new URL(request.url).pathname.endsWith('/documents')) {
    const limited=enforceRateLimit(request,{namespace:'promotion-upload',limit:12,windowMs:60000,key:`${session.auth_source}:${session.id}`});
    if(limited)return limited;
  }
  try {
    const pool=await getConnectedPool();
    const result=await transaction(pool,async db=>fn(db,await userContext(db,session)));
    return result instanceof Response ? result : ok(result);
  } catch(error) {
    if(error instanceof z.ZodError) return fail('Parameter permintaan tidak valid.',422);
    if(error.public) return fail(error.message,error.status);
    if(error.code==='23505' || error.code==='40001' || error.code==='40P01') return fail('Data sudah ada atau sedang berubah. Muat ulang dan coba kembali.',409);
    if(['23503','23514','22007','22008','22P02'].includes(error.code)) return fail('Referensi atau nilai konfigurasi tidak valid.',422);
    if(error.code==='42P01') return fail('Modul Kenaikan Pangkat belum diinisialisasi. Pengelola perlu menerapkan migration.',503);
    // Do not return SQL, credentials, storage paths or personnel document contents.
    console.error('[PROMOTION_REQUEST_FAILED]',error.code || error.name);
    return fail('Layanan Kenaikan Pangkat belum dapat memproses permintaan.',503);
  }
}
