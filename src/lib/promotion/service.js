import { randomUUID } from 'node:crypto';
import { check,has,canEdit,canVerify,canRecap,periodOpen,normalized,preEligibility } from './policy.js';
import { PromotionEligibilityEngine,inputHash } from './eligibility.js';
import { WORKFLOW,GATED,transition,assertValidationGate } from './workflow.js';
import { actor,audit,history,getSubmission,getEmployee,documentRows,loadInput,latestRun,scopeSql,masters,EMPLOYEE_SELECT,decorateEmployee,detail } from './repository.js';

async function refreshBatch(db,batchId) {
  if(!batchId) return;
  await db.query('SELECT id FROM promotion_batches WHERE id=? FOR UPDATE',[batchId]);
  const [rows]=await db.query('SELECT DISTINCT s.status FROM promotion_batch_members m JOIN promotion_submissions s ON s.id=m.submission_id WHERE m.batch_id=?',[batchId]);
  const status=rows.length===1?rows[0].status:rows.length?'DALAM_PROSES':'TANPA_ANGGOTA_AKTIF';
  const sent=rows.some(r=>['DIUSULKAN_KE_BKD','DIUSULKAN_KE_BKN','DISETUJUI','SK_TERBIT','SELESAI'].includes(r.status));
  await db.query('UPDATE promotion_batches SET status=?,submitted_at=CASE WHEN ? THEN COALESCE(submitted_at,now()) ELSE submitted_at END WHERE id=?',[status,sent,batchId]);
}

export async function candidates(db,user,q='') {
  check(has(user,'create') && user.ukpd_id,'Tidak memiliki kewenangan membuat usulan.',403);
  const [rows]=await db.query(`${EMPLOYEE_SELECT} WHERE lower(trim(p.jenis_pegawai))='pns' AND k.id_ukpd=? AND (p.nama ILIKE ? OR p.nip ILIKE ? OR p.nrk ILIKE ?) ORDER BY p.nama LIMIT 30`,[user.ukpd_id,`%${q}%`,`%${q}%`,`%${q}%`]);
  return rows.map(decorateEmployee).map(p=>({...p,precheck:preEligibility(p)}));
}
export async function listing(db,user,filters={}) {
  const scope=scopeSql(user),where=[scope.sql],params=[...scope.params];
  if(filters.q) { where.push("(s.employee_snapshot->>'nama' ILIKE ? OR s.employee_snapshot->>'nip' ILIKE ? OR s.employee_snapshot->>'nrk' ILIKE ?)");params.push(...Array(3).fill(`%${filters.q}%`)); }
  const filterColumns={period_id:'s.period_id',ukpd_id:'s.ukpd_id',type_id:'s.type_id',status:'s.status',wilayah:'s.wilayah',job:"s.employee_snapshot->>'jabatan'",level:"s.employee_snapshot->>'jenjang'",rank:"s.employee_snapshot->>'pangkat_golongan'",organization_type:"s.employee_snapshot->>'organization_type'",validation:'v.overall_status'};
  for(const [key,col] of Object.entries(filterColumns)) if(filters[key]) { where.push(`${col}=?`);params.push(filters[key]); }
  const from=`FROM promotion_submissions s LEFT JOIN LATERAL (SELECT overall_status FROM promotion_validation_runs WHERE submission_id=s.id ORDER BY id DESC LIMIT 1) v ON true WHERE ${where.join(' AND ')}`;
  const [totals]=await db.query(`SELECT count(*) AS total ${from}`,params);
  const page=Math.max(1,Number(filters.page)||1),pageSize=20;
  const [items]=await db.query(`SELECT s.*,s.created_at::text AS created_at,v.overall_status AS validation ${from} ORDER BY s.id DESC LIMIT ? OFFSET ?`,[...params,pageSize,(page-1)*pageSize]);
  for(const item of items) {
    const employee=await getEmployee(db,item.id_pegawai).catch(()=>null);
    if(employee?.golongan_atasan_langsung) item.employee_snapshot={...item.employee_snapshot,golongan_atasan_langsung:employee.golongan_atasan_langsung};
  }
  const [stats]=await db.query(`SELECT s.status,v.overall_status,count(*)::integer AS total ${from} GROUP BY s.status,v.overall_status`,params);
  const [returns]=await db.query(`SELECT r.code,count(*)::integer AS total FROM promotion_return_logs l JOIN promotion_return_reasons r ON r.id=l.reason_id JOIN promotion_submissions s ON s.id=l.submission_id WHERE ${scope.sql} ${filters.period_id?'AND s.period_id=?':''} GROUP BY r.code`,[...scope.params,...(filters.period_id?[filters.period_id]:[])]);
  const [errors]=await db.query(`SELECT s.employee_snapshot->>'nama_ukpd' AS name,count(*)::integer AS total FROM promotion_submissions s JOIN LATERAL (SELECT overall_status FROM promotion_validation_runs WHERE submission_id=s.id ORDER BY id DESC LIMIT 1) v ON true WHERE ${scope.sql} AND v.overall_status='FAILED' ${filters.period_id?'AND s.period_id=?':''} GROUP BY s.employee_snapshot->>'nama_ukpd' ORDER BY total DESC LIMIT 10`,[...scope.params,...(filters.period_id?[filters.period_id]:[])]);
  const master=await masters(db);
  const [units]=await db.query(`SELECT DISTINCT s.ukpd_id,s.employee_snapshot->>'nama_ukpd' AS name FROM promotion_submissions s WHERE ${scope.sql}`,scope.params);
  const [batches]=await db.query(`SELECT b.*,b.created_at::text AS created_at,count(m.id)::integer AS members FROM promotion_batches b JOIN promotion_batch_members m ON m.batch_id=b.id JOIN promotion_submissions s ON s.id=m.submission_id WHERE ${scope.sql} GROUP BY b.id ORDER BY b.id DESC`,scope.params);
  const [notifications]=await db.query(`SELECT h.id,h.submission_id,h.action,h.new_status,h.created_at::text AS created_at,s.employee_snapshot->>'nama' AS name FROM promotion_workflow_history h JOIN promotion_submissions s ON s.id=h.submission_id WHERE ${scope.sql} AND h.action IN ('submit','validate','approve','return','return_bkd','return_bkn','send_bkd','send_bkn','issue_sk') ORDER BY h.id DESC LIMIT 8`,scope.params);
  return {items,total:Number(totals[0].total),page,pageSize,stats,returns,errors,notifications,periods:master.periods,types:master.types.filter(t=>t.enabled),units,batches,returnReasons:master.returnReasons,user,statuses:[...new Set(Object.values(WORKFLOW).flat())]};
}
export async function createSubmission(db,user,data,request) {
  check(has(user,'create'),'Tidak memiliki kewenangan membuat usulan.',403);
  const employee=await getEmployee(db,data.id_pegawai);
  check(employee && employee.ukpd_id && Number(employee.ukpd_id)===Number(user.ukpd_id),'Pegawai bukan milik UKPD Anda.',403);
  check(normalized(employee.jenis_pegawai)==='pns','Hanya pegawai PNS dapat diusulkan.');
  check(employee.authority && employee.wilayah,'Wilayah/UKPD pegawai belum lengkap pada master data.');
  const master=await masters(db),period=master.periods.find(p=>p.id===data.period_id),type=master.types.find(t=>t.id===data.type_id && t.enabled);
  check(type && periodOpen(period),'Jenis KP atau periode tidak tersedia untuk pengajuan.');
  const [result]=await db.query(`INSERT INTO promotion_submissions(id_pegawai,ukpd_id,period_id,type_id,authority,wilayah,employee_snapshot,proposed_rank,created_by) VALUES(?,?,?,?,?,?,?::jsonb,?,?)`,[employee.id_pegawai,employee.ukpd_id,period.id,type.id,employee.authority,employee.wilayah,JSON.stringify(employee),data.proposed_rank,actor(user)]);
  const item={id:result.insertId,status:null};
  await history(db,user,item,'DRAFT','create');await audit(db,user,'create',item.id,null,{status:'DRAFT',id_pegawai:employee.id_pegawai},request);
  return {id:item.id};
}
async function runValidation(db,user,item,request) {
  check(canVerify(user,item),'Tidak memiliki kewenangan validasi.',403);
  check(['MENUNGGU_VERIFIKASI_SUDIN','MENUNGGU_VERIFIKASI_DINKES','SMART_VALIDATION','DIVERIFIKASI_SUDIN','DIVERIFIKASI_DINKES','SIAP_DIUSULKAN','MASUK_REKAP_PERIODE','DIUSULKAN_KE_BKD','DIUSULKAN_KE_BKN','DISETUJUI','SK_TERBIT'].includes(item.status),'Tahap usulan belum dapat divalidasi.',409);
  const input=await loadInput(db,item);
  const result=new PromotionEligibilityEngine().evaluate(input);
  if(Number(input.employee.ukpd_id)!==Number(item.ukpd_id) || input.employee.authority!==item.authority || normalized(input.employee.wilayah)!==normalized(item.wilayah)) {
    result.results.push({rule_code:'KP-SCOPE',severity:'ERROR',message:'Data wilayah atau UKPD pegawai berubah; perlu perbaikan usulan.',details:{}});
    result.counts.ERROR++;result.overall_status='FAILED';
  }
  const [insert]=await db.query('INSERT INTO promotion_validation_runs(submission_id,revision,input_hash,input_snapshot,overall_status,counts,created_by) VALUES(?,?,?,?::jsonb,?,?::jsonb,?)',[item.id,item.revision,inputHash(input),JSON.stringify(input),result.overall_status,JSON.stringify(result.counts),actor(user)]);
  for(const row of result.results) await db.query('INSERT INTO promotion_validation_results(run_id,rule_code,severity,message,details) VALUES(?,?,?,?,?::jsonb)',[insert.insertId,row.rule_code,row.severity,row.message,JSON.stringify(row.details)]);
  const after=['MENUNGGU_VERIFIKASI_SUDIN','MENUNGGU_VERIFIKASI_DINKES','DIVERIFIKASI_SUDIN','DIVERIFIKASI_DINKES','SIAP_DIUSULKAN'].includes(item.status)?'SMART_VALIDATION':item.status;
  await db.query('UPDATE promotion_submissions SET status=?,verified_revision=NULL,updated_at=now() WHERE id=?',[after,item.id]);
  await history(db,user,item,after,'validate');await audit(db,user,'validate',item.id,null,{run_id:insert.insertId,counts:result.counts},request);
  return {run_id:insert.insertId,...result};
}
export async function mutate(db,user,id,data,request) {
  const item=await getSubmission(db,user,id,true);
  if(data.revision !== undefined) check(item.revision===data.revision,'Usulan telah berubah; muat ulang.',409);
  const action=data.action;
  if(action==='validate') return runValidation(db,user,item,request);
  if(action==='confirm_review') {
    check(canVerify(user,item),'Tidak berwenang memverifikasi ulang.',403);
    check(['MASUK_REKAP_PERIODE','DIUSULKAN_KE_BKD','DIUSULKAN_KE_BKN','DISETUJUI','SK_TERBIT'].includes(item.status),'Tahap ini memakai aksi Setujui.');
    const input=await loadInput(db,item);
    assertValidationGate(await latestRun(db,id),inputHash(input),input.documents);
    await db.query('UPDATE promotion_submissions SET verified_revision=revision,updated_at=now() WHERE id=?',[id]);
    await history(db,user,item,item.status,action,data.note);await audit(db,user,action,id,null,{revision:item.revision,note:data.note},request);
    return {id};
  }
  if(action==='edit') {
    check(canEdit(user,item),'Usulan tidak dapat diubah.',403);
    const input=await loadInput(db,item);
    check(periodOpen(input.period),'Periode sudah ditutup.');
    check(input.employee.ukpd_id===item.ukpd_id,'Pegawai telah berpindah UKPD.',403);
    check(input.employee.authority && input.employee.wilayah,'Wilayah/UKPD pegawai belum lengkap pada master data.');
    await db.query('UPDATE promotion_submissions SET proposed_rank=?,employee_snapshot=?::jsonb,authority=?,wilayah=?,revision=revision+1,verified_revision=NULL,updated_at=now() WHERE id=?',[data.proposed_rank,JSON.stringify(input.employee),input.employee.authority,input.employee.wilayah,id]);
    await db.query('UPDATE promotion_documents SET verified_by=NULL,verified_at=NULL WHERE submission_id=? AND active=true',[id]);
    await audit(db,user,'edit',id,{proposed_rank:item.proposed_rank},{proposed_rank:data.proposed_rank},request);
    return {id};
  }
  check(action!=='recap','Gunakan aksi pembuatan batch untuk memasukkan rekap.');
  if(action==='acknowledge') {
    check(canVerify(user,item),'Tidak berwenang mengakui warning.',403);check(data.note?.trim(),'Alasan acknowledgement wajib diisi.');
    const run=await latestRun(db,id),input=await loadInput(db,item);
    check(run?.input_hash===inputHash(input),'Validasi telah kedaluwarsa.',409);
    const result=run.results.find(r=>r.id===data.result_id && r.severity==='WARNING');
    check(result,'Warning tidak ditemukan.');
    await db.query('UPDATE promotion_validation_results SET acknowledged_by=?,acknowledgement_note=?,acknowledged_at=now() WHERE id=?',[actor(user),data.note,result.id]);
    await audit(db,user,'acknowledge',id,null,{run_id:run.id,result_id:result.id,note:data.note},request);return {id};
  }
  const input=await loadInput(db,item);
  const next=transition({user,item,action,note:data.note,period:input.period});
  if(action==='submit') {
    const checkResult=new PromotionEligibilityEngine().evaluate(input);
    // UKPD can send documents for human review even when substantive policy is unresolved.
    check(!checkResult.results.some(r=>['KP-PNS','KP-007','KP-DOC-POLICY'].includes(r.rule_code) && r.severity==='ERROR'),'Lengkapi dokumen dan konfigurasi persyaratan sebelum mengajukan.');
    await history(db,user,item,'DIAJUKAN_UKPD','submit',data.note);
  }
  if(GATED.includes(action)) {
    assertValidationGate(await latestRun(db,id),inputHash(input),input.documents);
    if(action!=='approve') check(item.verified_revision===item.revision,'Verifikasi pejabat perlu diperbarui.',409);
  }
  if(action==='issue_sk') check(input.documents.some(d=>d.code==='SK_KP_TERBIT' && d.verified_by),'Unggah dan verifikasi SK kenaikan pangkat terbit.');
  if(action.startsWith('return_')) {
    check(data.reason_id && data.returned_at && data.note,'Kategori, tanggal dan catatan pengembalian wajib diisi.');
    if(data.document_id) check(input.documents.some(d=>d.id===data.document_id),'Dokumen terkait bukan milik usulan.');
    await db.query('INSERT INTO promotion_return_logs(submission_id,reason_id,institution,returned_at,subcategory,note,document_id,created_by) VALUES(?,?,?,?,?,?,?,?)',[id,data.reason_id,action==='return_bkd'?'BKD':'BKN',data.returned_at,data.subcategory || null,data.note,data.document_id || null,actor(user)]);
  }
  const reset=['return','return_bkd','return_bkn','reject'].includes(action);
  const [membership]=await db.query('SELECT batch_id FROM promotion_batch_members WHERE submission_id=?',[id]);
  if(reset) { await db.query('DELETE FROM promotion_batch_members WHERE submission_id=?',[id]);await db.query('UPDATE promotion_documents SET verified_by=NULL,verified_at=NULL WHERE submission_id=? AND active=true',[id]); }
  const verified=action==='approve'?item.revision:reset?null:item.verified_revision;
  await db.query('UPDATE promotion_submissions SET status=?,verified_revision=?,updated_at=now() WHERE id=?',[next,verified,id]);
  await history(db,user,item,next,action,data.note);await audit(db,user,action,id,{status:item.status},{status:next,note:data.note},request);
  await refreshBatch(db,membership[0]?.batch_id);
  return {id,status:next};
}
export async function batchValidate(db,user,ids,request) {
  const results=[];
  for(const id of [...new Set(ids)].sort((a,b)=>a-b)) results.push({id,...await mutate(db,user,id,{action:'validate'},request)});
  return results;
}
export async function createBatch(db,user,ids,request) {
  const items=[];
  for(const id of [...new Set(ids)].sort((a,b)=>a-b)) items.push(await getSubmission(db,user,id,true));
  const first=items[0];check(first,'Pilih usulan.');
  for(const item of items) {
    check(canRecap(user,item),'Tidak memiliki kewenangan rekap.',403);
    check(item.period_id===first.period_id && item.authority===first.authority && normalized(item.wilayah)===normalized(first.wilayah),'Batch harus satu periode, authority dan wilayah.');
    const input=await loadInput(db,item);
    transition({user,item,action:'recap',period:input.period});
    assertValidationGate(await latestRun(db,item.id),inputHash(input),input.documents);
    check(item.verified_revision===item.revision,'Usulan belum diverifikasi pejabat.',409);
  }
  const code=`KP-${first.period_id}-${first.authority}-${randomUUID().slice(0,8).toUpperCase()}`;
  const [result]=await db.query('INSERT INTO promotion_batches(code,period_id,authority,wilayah,created_by) VALUES(?,?,?,?,?)',[code,first.period_id,first.authority,first.wilayah,actor(user)]);
  for(const item of items) {
    await db.query('INSERT INTO promotion_batch_members(batch_id,submission_id) VALUES(?,?)',[result.insertId,item.id]);
    await db.query("UPDATE promotion_submissions SET status='MASUK_REKAP_PERIODE',updated_at=now() WHERE id=?",[item.id]);
    await history(db,user,item,'MASUK_REKAP_PERIODE','recap',code);
    await audit(db,user,'recap',item.id,{status:item.status},{batch_id:result.insertId},request);
  }
  return {id:result.insertId,code,count:items.length};
}
export async function recap(db,user,batchId,request) {
  const [batches]=await db.query('SELECT * FROM promotion_batches WHERE id=?',[batchId]);check(batches.length,'Batch tidak ditemukan.',404);
  const [members]=await db.query('SELECT submission_id FROM promotion_batch_members WHERE batch_id=? ORDER BY submission_id',[batchId]);
  check(members.length,'Batch tidak berisi usulan.');
  const items=[];
  for(const m of members) items.push(await detail(db,user,m.submission_id));
  check(has(user,'read_all') || items.every(item=>canRecap(user,item)),'Tidak berwenang mengekspor rekap.',403);
  await audit(db,user,'export',batchId,null,{count:items.length},request);
  return {batch:batches[0],items};
}

export async function periodRecap(db,user,periodId,request) {
  const scope=scopeSql(user);
  const [periods]=await db.query('SELECT *,effective_date::text AS effective_date FROM promotion_periods WHERE id=?',[periodId]);
  check(periods.length,'Periode tidak ditemukan.',404);
  const [rows]=await db.query(`SELECT s.id FROM promotion_submissions s WHERE ${scope.sql} AND s.period_id=? ORDER BY s.employee_snapshot->>'nama_ukpd',s.employee_snapshot->>'nama'`,[...scope.params,periodId]);
  check(rows.length,'Belum ada usulan pada periode ini.',404);
  const items=[];
  for(const row of rows) items.push(await detail(db,user,row.id));
  await audit(db,user,'export_period',periodId,null,{count:items.length},request);
  return {batch:{id:`PERIODE-${periodId}`,period_id:periodId,effective_date:periods[0].effective_date,code:`KP-PERIODE-${periodId}`},items};
}
