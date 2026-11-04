import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensurePensionSchema } from "@/lib/db/ensurePensionSchema";
import { fail, ok } from "@/lib/helpers/response";
import { normalizeVerification, normalizedDocumentName, parseObject, PENSION_DOCUMENT_LABELS, PENSION_DOCUMENT_MAX_BYTES } from "@/lib/usulan/pensiun";

export const runtime = "nodejs";
const STORAGE_ROOT = path.resolve(process.env.PENSION_STORAGE_ROOT || path.join(process.cwd(), "storage", "usulan-documents", "pensiun"));
const ROLES_ALLOWED = [ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD];
function inside(child,parent){ const rel=path.relative(parent,child); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }
function filePath(relativePath){ const full=path.resolve(process.cwd(),relativePath || ''); return inside(full,STORAGE_ROOT) ? full : null; }
function scope(user){ if(user.role===ROLES.SUPER_ADMIN) return {sql:'1 = 1',params:[]}; if(user.role===ROLES.ADMIN_WILAYAH) return {sql:'`wilayah` = ?',params:[user.wilayah]}; if(user.role===ROLES.ADMIN_UKPD) return {sql:'`nama_ukpd` = ?',params:[user.nama_ukpd]}; return {sql:'1 = 0',params:[]}; }
async function getItem(pool,user,id){ const s=scope(user); const [rows]=await pool.query(`SELECT * FROM \`usulan_pensiun\` WHERE \`id\`=? AND ${s.sql} LIMIT 1`,[id,...s.params]); return rows[0] || null; }
function params(request){ const sp=new URL(request.url).searchParams; return { id:Number(sp.get('id') || 0), key:sp.get('key') || '' }; }
export async function GET(request){
  const {user,error}=await requireAuth(ROLES_ALLOWED); if(error) return error; const {id,key}=params(request); if(!Number.isInteger(id)||id<=0||!PENSION_DOCUMENT_LABELS[key]) return fail('Parameter dokumen tidak valid.',422);
  const pool=await getConnectedPool(); await ensurePensionSchema(pool); const item=await getItem(pool,user,id); if(!item) return fail('Usulan tidak ditemukan atau tidak dapat diakses.',404);
  const doc=parseObject(item.dokumen)[key]; const full=filePath(doc?.path); if(!doc || !full) return fail('Dokumen belum tersedia.',404);
  try { const buffer=await fs.readFile(full); return new Response(buffer,{headers:{'Content-Type':'application/pdf','Content-Length':String(buffer.length),'Content-Disposition':`inline; filename="${normalizedDocumentName(key,item.nip,item.nama_pegawai)}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}); } catch { return fail('File dokumen tidak ditemukan.',404); }
}
export async function POST(request){
  const {user,error}=await requireAuth(ROLES_ALLOWED,request); if(error) return error; const form=await request.formData(); const id=Number(form.get('id')||0), key=String(form.get('key')||''), file=form.get('file');
  if(!Number.isInteger(id)||id<=0||!PENSION_DOCUMENT_LABELS[key]) return fail('Parameter upload tidak valid.',422); if(!file||typeof file.arrayBuffer!=='function') return fail('Pilih berkas PDF.',422); if(!String(file.name||'').toLowerCase().endsWith('.pdf')) return fail('Dokumen wajib PDF.',422); if(file.size<=0||file.size>PENSION_DOCUMENT_MAX_BYTES) return fail('Ukuran PDF maksimal 10 MB.',413);
  const buffer=Buffer.from(await file.arrayBuffer()); if(buffer.subarray(0,5).toString('utf8') !== '%PDF-') return fail('Berkas tidak terbaca sebagai PDF valid.',422);
  const pool=await getConnectedPool(); await ensurePensionSchema(pool); const item=await getItem(pool,user,id); if(!item) return fail('Usulan tidak ditemukan atau tidak dapat diakses.',404);
  const docs=parseObject(item.dokumen), ver=normalizeVerification(item.verifikasi); const dir=path.join(STORAGE_ROOT,String(id)); await fs.mkdir(dir,{recursive:true}); const full=path.join(dir,`${key}-${Date.now()}-${randomUUID()}.pdf`); await fs.writeFile(full,buffer);
  const previous=filePath(docs[key]?.path); docs[key]={key,label:PENSION_DOCUMENT_LABELS[key],name:normalizedDocumentName(key,item.nip,item.nama_pegawai),original_name:String(file.name||'dokumen.pdf').slice(0,160),path:path.relative(process.cwd(),full),size:buffer.length,uploaded_at:new Date().toISOString(),uploaded_by:user.nama_ukpd || user.username || user.role}; ver[key]=false;
  await pool.query('UPDATE `usulan_pensiun` SET `dokumen`=?,`verifikasi`=?,`updated_at`=NOW() WHERE `id`=?',[JSON.stringify(docs),JSON.stringify(ver),id]); if(previous && previous !== full) await fs.unlink(previous).catch(()=>{});
  return ok({ document:{...docs[key],url:`/api/usulan/pensiun/dokumen?id=${id}&key=${key}`}, verifikasi:ver },'Dokumen berhasil diunggah.');
}
