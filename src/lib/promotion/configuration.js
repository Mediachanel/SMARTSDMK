import { z } from 'zod';
import { check,has } from './policy.js';
import { audit,masters } from './repository.js';
const text=z.string().trim().min(1).max(500);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const selectors=z.record(z.enum(['type','job_category','job','rank','level','period']),z.array(z.string().max(300)).min(1).max(100));
const configuration=z.object({status:z.enum(['CONFIGURED','REQUIRES_POLICY_CONFIGURATION']),selectors:selectors.optional()}).passthrough();
const schemas={
  periods:z.object({year:z.number().int().min(2025).max(2200),month:z.number().int().min(1).max(12),effective_date:date,
    submission_start:z.string().datetime({offset:true}).nullable(),submission_end:z.string().datetime({offset:true}).nullable(),ukpd_deadline:z.string().datetime({offset:true}).nullable(),
    sudin_deadline:z.string().datetime({offset:true}).nullable(),dinkes_deadline:z.string().datetime({offset:true}).nullable(),status:z.enum(['DRAFT','OPEN','CLOSED'])}).strict(),
  types:z.object({code:text,name:text,configuration,enabled:z.boolean()}).strict(),
  requirements:z.object({code:text,name:text,configuration:configuration.extend({required:z.boolean()}),enabled:z.boolean()}).strict(),
  creditRules:z.object({code:text,name:text,configuration,enabled:z.boolean()}).strict(),
  rules:z.object({rule_code:text,rule_name:text,category:text,regulation_reference:text,severity:z.enum(['WARNING','ERROR']),applicable_promotion_type:text.nullable(),applicable_job_category:text.nullable(),effective_start:date,effective_end:date.nullable(),configuration:z.object({kind:z.enum(['match','cross','documents','rank','skp','overlap','credit','relevance'])}).passthrough(),enabled:z.boolean()}).strict(),
  organizations:z.object({ukpd_id:z.number().int().positive(),organization_type:z.enum(['DINAS','SUDIN','PUSKESMAS','UPT','RSUD']),hospital_class:z.enum(['A','B','C','D']).nullable(),promotion_verification_authority:z.enum(['SUDIN','DINKES']),wilayah:text.nullable(),configuration:z.object({job_levels:z.record(z.string(),z.string()).optional()}).strict()}).strict(),
  permissions:z.object({role_code:z.enum(['ADMIN_UKPD','ADMIN_WILAYAH','SUPER_ADMIN']),capabilities:z.array(z.string())}).strict()
};
const tables={periods:'promotion_periods',types:'promotion_types',requirements:'promotion_document_requirements',rules:'promotion_rules',creditRules:'promotion_credit_rules',organizations:'promotion_organizations',permissions:'promotion_permissions'};
export async function getConfiguration(db,user) {
  check(has(user,'configure') && user.role==='SUPER_ADMIN','Hanya Super Admin dapat mengelola konfigurasi.',403);
  const result=await masters(db);
  const [organizations]=await db.query('SELECT o.*,u.nama_ukpd FROM promotion_organizations o JOIN ukpd u ON u.id_ukpd=o.ukpd_id ORDER BY u.nama_ukpd');
  const [units]=await db.query('SELECT id_ukpd,nama_ukpd,wilayah FROM ukpd ORDER BY nama_ukpd');
  const [permissions]=await db.query('SELECT * FROM promotion_permissions ORDER BY id');
  return {...result,organizations,units,permissions};
}
export async function saveConfiguration(db,user,kind,id,raw,request) {
  check(has(user,'configure') && user.role==='SUPER_ADMIN','Hanya Super Admin dapat mengelola konfigurasi.',403);
  check(schemas[kind],'Master tidak dikenal.');
  const parsed=schemas[kind].safeParse(raw);check(parsed.success,'Format konfigurasi tidak valid. Periksa field, tanggal dan nilai wajib.');
  const values=parsed.data;
  if(values.configuration?.status==='CONFIGURED' && ['types','requirements','creditRules'].includes(kind)) {
    check(String(values.configuration.regulation_reference || '').trim().length>0,'Referensi kebijakan wajib diisi pada configuration.regulation_reference sebelum CONFIGURED.');
  }
  if(kind==='types') {
    const c=values.configuration;
    if(c.minimum_rank_months!==undefined) check(Number.isInteger(c.minimum_rank_months) && c.minimum_rank_months>=0 && c.minimum_rank_months<=1200,'minimum_rank_months harus bilangan bulat 0–1200.');
    if(c.confidence_threshold!==undefined) check(typeof c.confidence_threshold==='number' && c.confidence_threshold>=0 && c.confidence_threshold<=1,'confidence_threshold harus angka 0–1.');
  }
  if(kind==='creditRules' && values.configuration.status==='CONFIGURED') {
    const c=values.configuration;
    check(typeof c.minimum==='number' && Number.isFinite(c.minimum) && c.minimum>=0,'Minimum AK harus angka nonnegatif.');
    check(['sum','total'].includes(c.method) && date.safeParse(c.effective_start).success,'Metode dan tanggal mulai rule AK wajib diisi.');
    check(!c.effective_end || (date.safeParse(c.effective_end).success && c.effective_end>=c.effective_start),'Tanggal akhir rule AK tidak valid.');
  }
  if(kind==='periods') {
    check(values.effective_date===`${values.year}-${String(values.month).padStart(2,'0')}-01`,'Tanggal efektif harus tanggal 1 pada tahun/bulan periode.');
    if(values.status==='OPEN') check(['submission_start','submission_end','ukpd_deadline','sudin_deadline','dinkes_deadline'].every(k=>values[k]),'Seluruh deadline wajib untuk membuka periode.');
    if(values.submission_start && values.submission_end) check(Date.parse(values.submission_start)<=Date.parse(values.submission_end),'Rentang pengajuan tidak valid.');
    if(values.ukpd_deadline) check(Date.parse(values.submission_start)<=Date.parse(values.ukpd_deadline) && Date.parse(values.ukpd_deadline)<=Date.parse(values.submission_end),'Deadline UKPD di luar masa pengajuan.');
    for(const deadline of ['sudin_deadline','dinkes_deadline']) if(values[deadline] && values.ukpd_deadline) check(Date.parse(values[deadline])>=Date.parse(values.ukpd_deadline),'Batas verifikasi tidak boleh sebelum batas UKPD.');
  }
  if(kind==='permissions') {
    const allowed={ADMIN_UKPD:['read_own','create','edit'],ADMIN_WILAYAH:['read_region','verify_sudin','recap_sudin'],SUPER_ADMIN:['read_all','verify_dinkes','recap_dinkes','configure','correct_sudin']};
    check(values.capabilities.every(c=>allowed[values.role_code].includes(c)),'Capability melewati batas role existing.');
    if(values.role_code==='SUPER_ADMIN') check(values.capabilities.includes('configure'),'Capability konfigurasi Super Admin wajib dipertahankan.');
  }
  if(kind==='organizations') {
    check(values.organization_type!=='RSUD' || values.hospital_class,'Kelas rumah sakit wajib diisi.');
    check(values.promotion_verification_authority!=='SUDIN' || values.wilayah,'Wilayah Sudin wajib diisi.');
  }
  const table=tables[kind];let old=null;
  const dates=kind==='periods'?',effective_date::text AS effective_date':kind==='rules'?',effective_start::text AS effective_start,effective_end::text AS effective_end':'';
  if(id) { const [rows]=await db.query(`SELECT *${dates} FROM ${table} WHERE id=? FOR UPDATE`,[id]);old=rows[0];check(old,'Master tidak ditemukan.',404); }
  if(kind==='periods' && old && (old.effective_date!==values.effective_date)) {
    const [used]=await db.query('SELECT id FROM promotion_submissions WHERE period_id=? LIMIT 1',[id]);check(!used.length,'Tanggal periode yang sudah dipakai tidak dapat diubah.');
  }
  if(kind==='rules') {
    if(old) check(old.rule_code===values.rule_code,'Kode rule tidak dapat diganti; buat rule baru.');
    values.version=(old?.version || 0)+1;
    check(!values.effective_end || values.effective_end>=values.effective_start,'Rentang berlaku rule tidak valid.');
  }
  if(['types','requirements','creditRules'].includes(kind) && old) check(old.code===values.code,'Kode master yang sudah dibuat tidak dapat diganti.');
  const keys=Object.keys(values),params=keys.map(k=>typeof values[k]==='object' && values[k]!==null?JSON.stringify(values[k]):values[k]);
  if(id) await db.query(`UPDATE ${table} SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`,[...params,id]);
  else { const [result]=await db.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,params);id=result.insertId; }
  if(kind==='rules') {
    const [rows]=await db.query('SELECT *,effective_start::text AS effective_start,effective_end::text AS effective_end FROM promotion_rules WHERE id=?',[id]);
    await db.query('INSERT INTO promotion_rule_versions(rule_id,version,snapshot) VALUES(?,?,?::jsonb)',[id,values.version,JSON.stringify(rows[0])]);
  }
  await audit(db,user,`configure_${kind}`,id,old,{...values,id},request);return {id};
}
