import { z } from "zod";
import { requireAuth } from "@/lib/auth/requireAuth";
import { ROLES } from "@/lib/constants/roles";
import { getConnectedPool } from "@/lib/db/postgres";
import { ensurePensionSchema } from "@/lib/db/ensurePensionSchema";
import { fail, ok } from "@/lib/helpers/response";
import { documentProgress, normalizeVerification, parseObject, PENSION_DOCUMENT_LABELS, PENSION_DOCUMENT_RULES, PENSION_STATUSES, PENSION_TYPES } from "@/lib/usulan/pensiun";

const ROLES_ALLOWED = [ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH, ROLES.ADMIN_UKPD];
const createSchema = z.object({ nrk: z.string().regex(/^\d+$/), jenis_pensiun: z.enum(Object.keys(PENSION_TYPES)), tmt_pensiun: z.string().min(1).max(30) });
const updateSchema = z.object({ id: z.coerce.number().int().positive(), status: z.enum(PENSION_STATUSES).optional(), catatan: z.string().max(4000).optional(), verifikasi: z.record(z.string(), z.boolean()).optional() });
function cleanNrk(value) { return String(value || "").replace(/\D/g, ""); }
function scope(alias, user) {
  if (user.role === ROLES.SUPER_ADMIN) return { sql: "1 = 1", params: [] };
  if (user.role === ROLES.ADMIN_WILAYAH) return { sql: `${alias}.\`wilayah\` = ?`, params: [user.wilayah] };
  if (user.role === ROLES.ADMIN_UKPD) return { sql: `${alias}.\`nama_ukpd\` = ?`, params: [user.nama_ukpd] };
  return { sql: "1 = 0", params: [] };
}
function decorate(item) {
  const dokumen = parseObject(item.dokumen), verifikasi = normalizeVerification(item.verifikasi);
  return { ...item, dokumen: Object.fromEntries(Object.keys(PENSION_DOCUMENT_LABELS).map(key => [key, dokumen[key] ? { ...dokumen[key], url: `/api/usulan/pensiun/dokumen?id=${item.id}&key=${key}` } : null])), verifikasi, progress: documentProgress(dokumen, verifikasi) };
}
async function accessible(pool,user,id) { const s=scope('u',user); const [rows]=await pool.query(`SELECT u.* FROM \`usulan_pensiun\` u WHERE u.\`id\`=? AND ${s.sql} LIMIT 1`,[id,...s.params]); return rows[0] || null; }
export async function GET() {
  const { user, error } = await requireAuth(ROLES_ALLOWED); if (error) return error;
  const pool = await getConnectedPool(); await ensurePensionSchema(pool); const s=scope('u',user);
  const [items]=await pool.query(`SELECT u.* FROM \`usulan_pensiun\` u WHERE ${s.sql} ORDER BY u.\`created_at\` DESC,u.\`id\` DESC`,s.params);
  return ok({ items: items.map(decorate), documentLabels: PENSION_DOCUMENT_LABELS, documentRules: PENSION_DOCUMENT_RULES, statuses: PENSION_STATUSES, types: PENSION_TYPES, user: { role:user.role, nama_ukpd:user.nama_ukpd || '', wilayah:user.wilayah || '' } });
}
export async function POST(request) {
  const { user, error } = await requireAuth(ROLES_ALLOWED, request); if (error) return error;
  const parsed=createSchema.safeParse(await request.json()); if(!parsed.success) return fail('Data usulan pensiun tidak valid.',422,parsed.error.flatten());
  const pool=await getConnectedPool(); await ensurePensionSchema(pool); const nrk=cleanNrk(parsed.data.nrk);
  const [rows]=await pool.query(`SELECT p.\`id_pegawai\`,p.\`nrk\`,p.\`nip\`,p.\`nama\`,p.\`nama_ukpd\`,p.\`pangkat_golongan\`,COALESCE(NULLIF(p.\`nama_jabatan_menpan\`,''),p.\`nama_jabatan_orb\`) AS jabatan,COALESCE(NULLIF(p.\`wilayah\`,''),u.\`wilayah\`,'-') AS wilayah FROM \`pegawai\` p LEFT JOIN \`ukpd\` u ON u.\`nama_ukpd\`=p.\`nama_ukpd\` WHERE REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(p.\`nrk\`,'')),'\`',''),' ',''),'-',''),'.','')=? LIMIT 1`,[nrk]);
  const pegawai=rows[0]; if(!pegawai) return fail('Pegawai dengan NRK tersebut tidak ditemukan.',404);
  if(user.role===ROLES.ADMIN_UKPD && pegawai.nama_ukpd !== user.nama_ukpd) return fail('Pegawai bukan milik UKPD Anda.',403);
  if(user.role===ROLES.ADMIN_WILAYAH && pegawai.wilayah !== user.wilayah) return fail('Pegawai bukan wilayah Anda.',403);
  const [existing]=await pool.query('SELECT `id` FROM `usulan_pensiun` WHERE `id_pegawai`=? AND `status` <> ? LIMIT 1',[pegawai.id_pegawai,'Selesai']); if(existing.length) return fail('Pegawai sudah memiliki usulan pensiun aktif.',409);
  const result=await pool.query(`INSERT INTO \`usulan_pensiun\` (\`id_pegawai\`,\`nrk\`,\`nip\`,\`nama_pegawai\`,\`nama_ukpd\`,\`wilayah\`,\`pangkat_golongan\`,\`jabatan\`,\`jenis_pensiun\`,\`tmt_pensiun\`,\`status\`,\`dokumen\`,\`verifikasi\`,\`created_by\`,\`created_by_ukpd\`) VALUES (?,?,?,?,?,?,?,?,?,?,'Draft UKPD',?,?,?,?)`,[pegawai.id_pegawai,pegawai.nrk,pegawai.nip,pegawai.nama,pegawai.nama_ukpd,pegawai.wilayah,pegawai.pangkat_golongan,pegawai.jabatan,parsed.data.jenis_pensiun,parsed.data.tmt_pensiun,JSON.stringify({}),JSON.stringify({}),user.username || user.id,user.nama_ukpd || '']);
  const id=result[0].insertId; const [created]=await pool.query('SELECT * FROM `usulan_pensiun` WHERE `id`=?',[id]); return ok(decorate(created[0]),'Draft usulan pensiun berhasil dibuat.');
}
export async function PATCH(request) {
  const { user, error } = await requireAuth(ROLES_ALLOWED, request); if (error) return error;
  const parsed=updateSchema.safeParse(await request.json()); if(!parsed.success) return fail('Perubahan usulan pensiun tidak valid.',422,parsed.error.flatten());
  const pool=await getConnectedPool(); await ensurePensionSchema(pool); const item=await accessible(pool,user,parsed.data.id); if(!item) return fail('Usulan tidak ditemukan atau tidak dapat diakses.',404);
  await pool.query('UPDATE `usulan_pensiun` SET `status`=COALESCE(?,`status`),`catatan`=COALESCE(?,`catatan`),`verifikasi`=COALESCE(?,`verifikasi`),`updated_at`=NOW() WHERE `id`=?',[parsed.data.status || null, parsed.data.catatan ?? null, parsed.data.verifikasi ? JSON.stringify(parsed.data.verifikasi) : null, item.id]);
  const [rows]=await pool.query('SELECT * FROM `usulan_pensiun` WHERE `id`=?',[item.id]); return ok(decorate(rows[0]),'Usulan pensiun berhasil disimpan.');
}
export async function DELETE(request) {
  const { user, error } = await requireAuth(ROLES_ALLOWED, request); if (error) return error;
  const id=Number(new URL(request.url).searchParams.get('id') || 0); const pool=await getConnectedPool(); await ensurePensionSchema(pool); const item=await accessible(pool,user,id); if(!item) return fail('Usulan tidak ditemukan atau tidak dapat diakses.',404);
  await pool.query('DELETE FROM `usulan_pensiun` WHERE `id`=?',[id]); return ok({ id },'Usulan pensiun berhasil dihapus.');
}
