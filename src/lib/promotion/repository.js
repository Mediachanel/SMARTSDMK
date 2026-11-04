import { check,canRead,has,contextFor,effectiveRequirements,normalized } from './policy.js';
import { inputHash } from './eligibility.js';
export const actor = user => `${user.auth_source || 'session'}:${user.id}`;
export async function transaction(pool,fn) {
  const db=await pool.getConnection();
  try { await db.beginTransaction(); await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); const result=await fn(db); await db.commit(); return result; }
  catch(error) { await db.rollback(); throw error; } finally { db.release(); }
}
export async function userContext(db,session) {
  check(['ADMIN_UKPD','ADMIN_WILAYAH','SUPER_ADMIN'].includes(session.role),'Tidak memiliki akses modul KP.',403);
  let identity;
  if(session.auth_source === 'ukpd') {
    const [rows]=await db.query('SELECT id_ukpd AS ukpd_id,role,wilayah,nama_ukpd FROM ukpd WHERE id_ukpd=?',[session.id]); identity=rows[0];
  } else if(session.auth_source === 'app_users') {
    const [rows]=await db.query('SELECT ukpd_id,role_code AS role,wilayah,nama_ukpd FROM app_users WHERE id=? AND is_active=true',[session.id]); identity=rows[0];
    if(identity && !identity.ukpd_id) {
      const [units]=await db.query('SELECT id_ukpd FROM ukpd WHERE lower(trim(nama_ukpd))=lower(trim(?))',[identity.nama_ukpd]);
      if(units.length===1) identity.ukpd_id=units[0].id_ukpd;
    }
  }
  check(identity && identity.role === session.role,'Identitas atau role akun berubah. Silakan login ulang.',403);
  const [permissions]=await db.query('SELECT capabilities FROM promotion_permissions WHERE role_code=?',[identity.role]);
  return {...session,...identity,capabilities:permissions[0]?.capabilities || []};
}
export function scopeSql(user,alias='s') {
  if(has(user,'read_all')) return {sql:'TRUE',params:[]};
  const clauses=[],params=[];
  if(has(user,'read_own') && user.ukpd_id) { clauses.push(`${alias}.ukpd_id=?`); params.push(user.ukpd_id); }
  if(has(user,'read_region') && user.wilayah) { clauses.push(`(${alias}.authority='SUDIN' AND lower(trim(${alias}.wilayah))=lower(trim(?)))`);params.push(user.wilayah); }
  return {sql:clauses.length?`(${clauses.join(' OR ')})`:'FALSE',params};
}
export async function getSubmission(db,user,id,lock=false) {
  const [rows]=await db.query(`SELECT s.*,s.created_at::text AS created_at,s.updated_at::text AS updated_at FROM promotion_submissions s WHERE s.id=? ${lock?'FOR UPDATE':''}`,[id]);
  check(rows[0] && canRead(user,rows[0]),'Usulan tidak dapat diakses.',403);
  return rows[0];
}
export async function audit(db,user,action,id,oldValue,newValue,request=null) {
  await db.query(`INSERT INTO audit_logs(actor_id,actor_role,action,entity_type,entity_id,ip_address,metadata)
    VALUES(?,?,?,?,?,?,?::jsonb)`,[actor(user),user.role,`promotion.${action}`,'promotion',String(id),request?.headers?.get('x-real-ip')?.slice(0,80) || null,JSON.stringify({old_value:oldValue,new_value:newValue})]);
}
export async function history(db,user,item,status,action,note='') {
  await db.query('INSERT INTO promotion_workflow_history(submission_id,actor,role,action,old_status,new_status,note) VALUES(?,?,?,?,?,?,?)',[item.id,actor(user),user.role,action,item.status,status,note]);
}
export async function masters(db) {
  const [periods]=await db.query('SELECT *,effective_date::text AS effective_date,submission_start::text AS submission_start,submission_end::text AS submission_end,ukpd_deadline::text AS ukpd_deadline,sudin_deadline::text AS sudin_deadline,dinkes_deadline::text AS dinkes_deadline FROM promotion_periods ORDER BY promotion_periods.effective_date DESC');
  const [types]=await db.query('SELECT * FROM promotion_types ORDER BY id');
  const [requirements]=await db.query('SELECT * FROM promotion_document_requirements ORDER BY id');
  const [rules]=await db.query('SELECT *,effective_start::text AS effective_start,effective_end::text AS effective_end FROM promotion_rules ORDER BY rule_code');
  const [versions]=await db.query('SELECT snapshot FROM promotion_rule_versions ORDER BY rule_id,version');
  const [creditRules]=await db.query('SELECT * FROM promotion_credit_rules ORDER BY id');
  const [returnReasons]=await db.query('SELECT * FROM promotion_return_reasons ORDER BY id');
  return {periods,types,requirements,rules,versions:versions.map(v=>v.snapshot),creditRules,returnReasons};
}
export const EMPLOYEE_SELECT = `SELECT p.id_pegawai,p.nama,p.nip,p.nrk,p.jenis_pegawai,p.nama_ukpd,p.pangkat_golongan,
  p.tmt_pangkat_terakhir,p.jenjang_pendidikan,p.status_rumpun,p.struktur_atasan_langsung,
  COALESCE(NULLIF(p.nama_jabatan_menpan,''),p.nama_jabatan_orb) AS jabatan,
  (SELECT COALESCE(
     (SELECT rp.pangkat_golongan FROM riwayat_pangkat rp
      WHERE rp.id_pegawai=bp.id_pegawai AND rp.pangkat_golongan ~* '(I|V|X)+/[a-e]'
      ORDER BY rp.tmt_pangkat DESC NULLS LAST,rp.id DESC LIMIT 1),
     bp.pangkat_golongan)
   FROM pegawai bp
   WHERE lower(trim(bp.nama_ukpd))=lower(trim(p.nama_ukpd))
     AND (lower(trim(COALESCE(bp.nama_jabatan_orb,'')))=lower(trim(p.struktur_atasan_langsung))
       OR lower(trim(COALESCE(bp.nama_jabatan_menpan,'')))=lower(trim(p.struktur_atasan_langsung))
       OR lower(trim(COALESCE(NULLIF(bp.nama_jabatan_menpan,''),bp.nama_jabatan_orb,'')))=lower(trim(p.struktur_atasan_langsung)))
   ORDER BY bp.id_pegawai
   LIMIT 1) AS golongan_atasan_langsung,
  k.id_ukpd AS ukpd_id,COALESCE(NULLIF(o.wilayah,''),NULLIF(p.wilayah,''),k.wilayah) AS wilayah,k.role AS ukpd_role,
  COALESCE(o.organization_type,k.role) AS organization_type,o.hospital_class,
  COALESCE(o.promotion_verification_authority,CASE WHEN k.role IN ('SUPER_ADMIN','ADMIN_WILAYAH') THEN 'DINKES' ELSE 'SUDIN' END) AS authority,
  (SELECT r.tmt_jabatan FROM riwayat_jabatan r WHERE r.id_pegawai=p.id_pegawai ORDER BY r.tmt_jabatan DESC NULLS LAST,r.id DESC LIMIT 1) AS tmt_jabatan
  FROM pegawai p
  LEFT JOIN ukpd k ON k.id_ukpd=COALESCE(p.id_ukpd,
    (SELECT u.id_ukpd FROM ukpd u WHERE u.ukpd_id=p.ukpd_id AND p.ukpd_id IS NOT NULL AND (SELECT count(*) FROM ukpd x WHERE x.ukpd_id=p.ukpd_id)=1),
    (SELECT u.id_ukpd FROM ukpd u WHERE lower(trim(u.nama_ukpd))=lower(trim(p.nama_ukpd)) AND (SELECT count(*) FROM ukpd x WHERE lower(trim(x.nama_ukpd))=lower(trim(p.nama_ukpd)))=1))
  LEFT JOIN promotion_organizations o ON o.ukpd_id=k.id_ukpd`;
function inferJobLevel(jabatan) {
  const text=normalized(jabatan);
  if(!text) return null;
  const levels=['ahli utama','ahli madya','ahli muda','ahli pertama','penyelia','mahir','terampil','pemula'];
  return levels.find(level=>text.includes(level)) || null;
}
export function decorateEmployee(p) {
  if(!p) return p;
  return {...p,jenjang:inferJobLevel(p.jabatan),organization_type:p.organization_type || p.ukpd_role || null,photo_url:`/api/pegawai/${p.id_pegawai}/photo`};
}
export async function getEmployee(db,id) {
  const [rows]=await db.query(`${EMPLOYEE_SELECT} WHERE p.id_pegawai=?`,[id]);
  return decorateEmployee(rows[0]);
}
export async function documentRows(db,id) {
  const [rows]=await db.query(`SELECT d.id,d.submission_id,d.requirement_id,d.storage_key,d.name,d.size,d.sha256,d.verified_by,d.created_at::text AS created_at,
    r.code,r.name AS label,e.id AS extraction_id,e.extracted_document_data,e.status AS extraction_status,e.extraction_method
    FROM promotion_documents d JOIN promotion_document_requirements r ON r.id=d.requirement_id
    LEFT JOIN LATERAL (SELECT * FROM promotion_document_extractions e WHERE e.document_id=d.id ORDER BY e.id DESC LIMIT 1) e ON true
    WHERE d.submission_id=? AND d.active=true ORDER BY d.id`,[id]);
  return rows;
}
export async function loadInput(db,item) {
  const master=await masters(db),employee=await getEmployee(db,item.id_pegawai);
  check(employee,'Pegawai tidak ditemukan.');
  const period=master.periods.find(p=>p.id===item.period_id),type=master.types.find(t=>t.id===item.type_id);
  check(period && type?.enabled,'Periode atau jenis KP tidak tersedia.');
  const documents=await documentRows(db,item.id);
  // Select latest applicable immutable version, respecting current enabled flag.
  const rules=master.rules.filter(r=>r.enabled).map(current=>master.versions.filter(v=>v.id===current.id && v.effective_start<=period.effective_date && (!v.effective_end || v.effective_end>=period.effective_date)).sort((a,b)=>b.version-a.version)[0]).filter(Boolean);
  return {employee,submission:{id:item.id,proposed_rank:item.proposed_rank,ukpd_id:item.ukpd_id,authority:item.authority,revision:item.revision},period,type,documents,requirements:master.requirements,rules,creditRules:master.creditRules};
}
export async function latestRun(db,id) {
  const [runs]=await db.query('SELECT *,created_at::text AS created_at FROM promotion_validation_runs WHERE submission_id=? ORDER BY id DESC LIMIT 1',[id]);
  if(!runs.length) return null;
  const [results]=await db.query('SELECT * FROM promotion_validation_results WHERE run_id=? ORDER BY id',[runs[0].id]);
  return {...runs[0],results};
}
export async function detail(db,user,id) {
  const item=await getSubmission(db,user,id),input=await loadInput(db,item);
  const [timeline]=await db.query('SELECT *,created_at::text AS created_at FROM promotion_workflow_history WHERE submission_id=? ORDER BY id',[id]);
  const [returns]=await db.query('SELECT l.*,l.returned_at::text AS returned_at,r.name AS category FROM promotion_return_logs l JOIN promotion_return_reasons r ON r.id=l.reason_id WHERE l.submission_id=? ORDER BY l.id',[id]);
  const run=await latestRun(db,id);
  if(run) { run.stale=run.input_hash!==inputHash(input);delete run.input_snapshot; }
  return {...item,employee:input.employee,period:input.period,type:input.type,documents:input.documents,requirements:effectiveRequirements(input.requirements,contextFor(item,input.employee,input.type,input.period)),timeline,returns,run};
}
