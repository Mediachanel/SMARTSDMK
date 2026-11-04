export const POLICY_REQUIRED = 'REQUIRES_POLICY_CONFIGURATION';
export const EDITABLE = ['DRAFT','PERLU_PERBAIKAN_UKPD'];
export const MODULE_ROLES = ['SUPER_ADMIN','ADMIN_WILAYAH','ADMIN_UKPD'];
export function problem(message, status = 422) { return Object.assign(new Error(message), { status, public: true }); }
export function check(value, message, status = 422) { if (!value) throw problem(message, status); }
export const normalized = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export function has(user, capability) { return MODULE_ROLES.includes(user?.role) && user.capabilities?.includes(capability); }
export function canRead(user, item) {
  if (!item || !MODULE_ROLES.includes(user?.role)) return false;
  if (has(user,'read_all')) return true;
  if (has(user,'read_own') && user.ukpd_id && Number(user.ukpd_id) === Number(item.ukpd_id)) return true;
  return Boolean(has(user,'read_region') && item.authority === 'SUDIN' && normalized(user.wilayah) && normalized(user.wilayah) === normalized(item.wilayah));
}
export function canEdit(user, item) { return has(user,'edit') && Number(user.ukpd_id) === Number(item.ukpd_id) && EDITABLE.includes(item.status); }
export function canVerify(user, item) {
  if (!canRead(user,item)) return false;
  if (item.authority === 'DINKES') return has(user,'verify_dinkes');
  return has(user,'correct_sudin') || (has(user,'verify_sudin') && normalized(user.wilayah) === normalized(item.wilayah));
}
export function canRecap(user,item) {
  return canVerify(user,item) && (has(user,item.authority === 'SUDIN' ? 'recap_sudin' : 'recap_dinkes') || has(user,'correct_sudin'));
}
export function applies(selectors = {}, context = {}) {
  return Object.entries(selectors).every(([key, values]) => Array.isArray(values) && values.some(value => normalized(value) === normalized(context[key])));
}
export function contextFor(submission, employee, type, period) {
  return { type: type.code, job_category: employee.status_rumpun, job: employee.jabatan,
    rank: employee.pangkat_golongan, level: employee.jenjang, period: String(period.id) };
}
export function effectiveRequirements(requirements, context) {
  return requirements.filter(r => r.enabled && applies(r.configuration?.selectors,context));
}
export function periodOpen(period, now = new Date()) {
  const time = now.getTime();
  return period?.status === 'OPEN' && time >= Date.parse(period.submission_start) && time <= Math.min(Date.parse(period.submission_end),Date.parse(period.ukpd_deadline));
}
export function preEligibility(employee, type = {}) {
  const checks = [
    ['Data PNS ditemukan',normalized(employee.jenis_pegawai) === 'pns'],
    ['Pangkat terakhir tersedia',Boolean(employee.pangkat_golongan)],
    ['TMT pangkat tersedia',Boolean(employee.tmt_pangkat_terakhir)],
    ['Jabatan tersedia',Boolean(employee.jabatan)],['Unit kerja tersedia',Boolean(employee.ukpd_id)]
  ].map(([message,value]) => ({ severity:value ? 'PASS':'ERROR',message }));
  checks.push({ severity:'WARNING',message:'Angka kredit dan SKP perlu diperiksa dari dokumen.' });
  let potentialPeriod = null;
  const months = type.configuration?.minimum_rank_months;
  if (type.configuration?.status === 'CONFIGURED' && Number.isInteger(months) && months >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(employee.tmt_pangkat_terakhir || '')) {
    const date = new Date(`${employee.tmt_pangkat_terakhir}T00:00:00Z`);
    if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==employee.tmt_pangkat_terakhir) return {checks,potentialPeriod:null,informational:true,policyStatus:POLICY_REQUIRED};
    const candidate = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+months,1));
    if (date.getUTCDate() > 1) candidate.setUTCMonth(candidate.getUTCMonth()+1);
    potentialPeriod = candidate.toISOString().slice(0,10);
  }
  return { checks,potentialPeriod,informational:true,policyStatus:potentialPeriod ? 'CONFIGURED':POLICY_REQUIRED };
}
