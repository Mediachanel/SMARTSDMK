import { canEdit,canVerify,canRecap,check,periodOpen } from './policy.js';
export const WORKFLOW = {
  submit:['DRAFT','PERLU_PERBAIKAN_UKPD'],
  return:['MENUNGGU_VERIFIKASI_SUDIN','MENUNGGU_VERIFIKASI_DINKES','SMART_VALIDATION','DIVERIFIKASI_SUDIN','DIVERIFIKASI_DINKES','SIAP_DIUSULKAN','PERBAIKAN_BKD','PERBAIKAN_BKN'],
  approve:['SMART_VALIDATION'], ready:['DIVERIFIKASI_SUDIN','DIVERIFIKASI_DINKES'],
  recap:['SIAP_DIUSULKAN'], send_bkd:['MASUK_REKAP_PERIODE'], send_bkn:['DIUSULKAN_KE_BKD'],
  return_bkd:['DIUSULKAN_KE_BKD'],return_bkn:['DIUSULKAN_KE_BKN'],
  accept:['DIUSULKAN_KE_BKD','DIUSULKAN_KE_BKN'], issue_sk:['DISETUJUI'],finish:['SK_TERBIT'],
  reject:['SMART_VALIDATION','DIUSULKAN_KE_BKD','DIUSULKAN_KE_BKN']
};
export const GATED = ['approve','ready','recap','send_bkd','send_bkn','accept','issue_sk','finish'];
export function transition({user,item,action,note,period,now = new Date()}) {
  check(WORKFLOW[action]?.includes(item.status),'Aksi tidak sesuai tahap usulan.',409);
  if (action === 'submit') {
    check(canEdit(user,item),'Tidak berwenang mengajukan usulan.',403);
    check(periodOpen(period,now),'Periode/batas UKPD sudah ditutup atau belum dibuka.');
    return `MENUNGGU_VERIFIKASI_${item.authority}`;
  }
  check(canVerify(user,item),'Tidak memiliki kewenangan verifikasi usulan ini.',403);
  if (['recap','send_bkd','send_bkn','return_bkd','return_bkn','accept','issue_sk','finish'].includes(action)) check(canRecap(user,item),'Tidak memiliki kewenangan rekap.',403);
  if (['approve','ready','recap'].includes(action)) {
    const deadline = item.authority === 'SUDIN' ? period.sudin_deadline : period.dinkes_deadline;
    check(deadline && now <= new Date(deadline),'Batas verifikasi belum dikonfigurasi atau telah lewat.');
  }
  if (['return','return_bkd','return_bkn','reject'].includes(action)) check(String(note || '').trim(),'Catatan alasan wajib diisi.');
  return { return:'PERLU_PERBAIKAN_UKPD',approve:`DIVERIFIKASI_${item.authority}`,ready:'SIAP_DIUSULKAN',recap:'MASUK_REKAP_PERIODE',send_bkd:'DIUSULKAN_KE_BKD',send_bkn:'DIUSULKAN_KE_BKN',return_bkd:'PERBAIKAN_BKD',return_bkn:'PERBAIKAN_BKN',accept:'DISETUJUI',issue_sk:'SK_TERBIT',finish:'SELESAI',reject:'DITOLAK' }[action];
}
export function assertValidationGate(run, hash, documents, requireVerified = true) {
  check(run && run.input_hash === hash,'Jalankan ulang Smart Validation; data atau kebijakan telah berubah.',409);
  const errors = run.results.filter(r=>r.severity==='ERROR').length;
  check(!errors,`Usulan belum dapat diteruskan karena masih terdapat ${errors} kesalahan yang harus diperbaiki.`);
  check(run.results.every(r=>r.severity !== 'WARNING' || r.acknowledged_by),'Warning perlu acknowledgement validator beserta alasan.');
  if (requireVerified) check(documents.length && documents.every(d=>d.verified_by),'Seluruh dokumen perlu diverifikasi pejabat sesuai kewenangan.');
  check(documents.every(d=>d.extraction_status === 'REVIEWED' || d.extraction_status === 'EXTRACTED'),'Pembacaan dokumen perlu review manual sebelum dilanjutkan.');
}
