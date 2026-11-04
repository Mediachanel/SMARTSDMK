import { createHash } from 'node:crypto';
import { POLICY_REQUIRED, normalized, contextFor, effectiveRequirements } from './policy.js';

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k,canonical(value[k])]));
  return value;
}
export function inputHash(input) { return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex'); }
export function dateValue(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  const candidate = iso ? text : local ? `${local[3]}-${local[2]}-${local[1]}` : null;
  if (!candidate) return null;
  const d = new Date(`${candidate}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === candidate ? candidate : null;
}
const val = field => field?.extracted_value;
const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const same = (a,b,field) => field.startsWith('tmt') ? Boolean(dateValue(a) && dateValue(a) === dateValue(b)) : normalized(a) === normalized(b);

export class PromotionEligibilityEngine {
  evaluate(input) {
    const { employee,submission,period,type,documents = [],requirements = [],rules = [],creditRules = [] } = input;
    const results = [];
    const add = (code,severity,message,details={}) => results.push({ rule_code:code,severity,message,details });
    const context = contextFor(submission,employee,type,period);
    const required = effectiveRequirements(requirements,context);
    if (normalized(employee.jenis_pegawai) !== 'pns') add('KP-PNS','ERROR','Hanya PNS dapat diusulkan.');
    if (!dateValue(period.effective_date)) add('KP-PERIOD','ERROR','Tanggal efektif periode tidak valid.');
    if (type.configuration?.status !== 'CONFIGURED') add('KP-POLICY','ERROR',POLICY_REQUIRED,{ subject:'promotion_types' });
    if (!required.length || required.some(r=>r.configuration?.status !== 'CONFIGURED')) add('KP-DOC-POLICY','ERROR',POLICY_REQUIRED,{ subject:'promotion_document_requirements' });
    for (const d of documents) {
      const fields = d.extracted_document_data || {};
      if (d.extraction_status !== 'REVIEWED' && (d.extraction_status !== 'EXTRACTED' || !Object.keys(fields).length || Object.values(fields).some(f=> !Number.isFinite(f.confidence) || f.confidence < (type.configuration?.confidence_threshold ?? 0.9)))) {
        add('KP-OCR','WARNING','MANUAL_REVIEW_REQUIRED: hasil pembacaan dokumen perlu diperiksa.',{ document_id:d.id });
      }
    }
    // Choose applicable version by promotion effective date; snapshots are preserved by the repository.
    const active = rules.filter(r=>r.enabled && r.effective_start <= period.effective_date && (!r.effective_end || r.effective_end >= period.effective_date)
      && (!r.applicable_promotion_type || r.applicable_promotion_type === type.code)
      && (!r.applicable_job_category || normalized(r.applicable_job_category) === normalized(employee.status_rumpun)));
    if (!active.length) add('KP-RULE-POLICY','ERROR',POLICY_REQUIRED,{ subject:'promotion_rules' });
    for (const rule of active) {
      const c = rule.configuration || {};
      const detail = { version:rule.version,regulation_reference:rule.regulation_reference };
      const emit = (severity,message,extra={}) => add(rule.rule_code,severity,message,{...detail,...extra});
      const error = (message,extra) => emit(rule.severity || 'ERROR',message,extra);
      if (c.status === POLICY_REQUIRED) { emit('ERROR',POLICY_REQUIRED); continue; }
      const selected = documents.filter(d=>!c.document_codes || c.document_codes.includes(d.code));
      if (c.kind === 'documents') {
        const missing = required.filter(r=>r.configuration.required && !documents.some(d=>d.requirement_id === r.id));
        missing.length ? error('Dokumen wajib belum lengkap.',{ missing:missing.map(r=>r.name) }) : emit('PASS','Dokumen wajib tersedia.');
      } else if (c.kind === 'match') {
        if (!selected.length) { emit('WARNING','Dokumen pembanding belum tersedia.',{ document_codes:c.document_codes }); continue; }
        for (const d of selected) {
          const actual = val(d.extracted_document_data?.[c.field]);
          const expected = employee[c.employee_field];
          if (!actual || !expected) error('Data pembanding belum lengkap; lengkapi data atau hasil pemeriksaan manual.',{ document_id:d.id,field:c.field });
          else if (!same(actual,expected,c.field)) error(`${c.field} pada dokumen tidak sama dengan database.`,{document_id:d.id,actual,expected});
          else emit('PASS',`${c.field} sesuai.`,{ document_id:d.id });
        }
      } else if (c.kind === 'cross') {
        const values = selected.map(d=>({id:d.id,value:val(d.extracted_document_data?.[c.field])}));
        if (values.length < 2 || values.some(v=>!v.value)) emit('WARNING','Data lintas dokumen belum lengkap.',{ field:c.field });
        else new Set(values.map(v=>normalized(v.value))).size > 1 ? error('Jenjang jabatan lintas dokumen tidak konsisten.',{values}) : emit('PASS','Jenjang jabatan konsisten.');
      } else if (c.kind === 'rank') {
        if (!Array.isArray(c.transitions) || !c.transitions.length) { emit('ERROR',POLICY_REQUIRED); continue; }
        c.transitions.some(t=>same(t.from,employee.pangkat_golongan,'rank') && same(t.to,submission.proposed_rank,'rank')) ? emit('PASS','Transisi pangkat sesuai konfigurasi.') : error('Pangkat usulan di luar transisi yang diizinkan.');
      } else if (c.kind === 'skp') {
        if (!Array.isArray(c.allowed_ratings) || !c.required_years?.length) { emit('ERROR',POLICY_REQUIRED); continue; }
        for (const year of c.required_years) {
          const doc = documents.find(d=>d.code==='SKP' && String(val(d.extracted_document_data?.tahun_skp)) === String(year));
          const rating = val(doc?.extracted_document_data?.nilai_skp);
          c.allowed_ratings.some(v=>normalized(v) === normalized(rating)) ? emit('PASS',`SKP ${year} sesuai.`) : error(`SKP ${year} belum memenuhi konfigurasi.`,{ actual:rating ?? null });
        }
      } else if (c.kind === 'overlap') {
        const pak = documents.filter(d=>d.code === 'PAK').map(d=>({id:d.id,start:dateValue(val(d.extracted_document_data?.periode_awal)),end:dateValue(val(d.extracted_document_data?.periode_akhir))}));
        if (!pak.length || pak.some(p=>!p.start || !p.end || p.start>p.end)) { emit('WARNING','Periode PAK perlu diperiksa manual.'); continue; }
        const overlap = pak.flatMap((a,i)=>pak.slice(i+1).filter(b=>a.start<=b.end && b.start<=a.end).map(b=>[a.id,b.id]));
        overlap.length ? error('Periode penilaian PAK terindikasi tumpang tindih.',{ overlap }) : emit('PASS','Periode PAK tidak overlap.');
      } else if (c.kind === 'credit') {
        const applicable = creditRules.filter(r=>r.enabled && r.configuration?.status === 'CONFIGURED' && appliesCredit(r.configuration,context,period));
        if (applicable.length !== 1) { emit('ERROR',POLICY_REQUIRED,{subject:'promotion_credit_rules'}); continue; }
        const config = applicable[0].configuration;
        const minimum = numeric(config.minimum);
        if (minimum === null || !['sum','total'].includes(config.method)) { emit('ERROR',POLICY_REQUIRED); continue; }
        const pak = documents.filter(d=>d.code === 'PAK');
        if (!pak.length) { error('PAK belum tersedia.'); continue; }
        for (const d of pak) {
          const f = d.extracted_document_data || {};
          const initial = numeric(val(f.angka_kredit_awal)), additional = numeric(val(f.angka_kredit_tambahan)), total = numeric(val(f.total_angka_kredit));
          const calculated = config.method === 'sum' ? initial === null || additional === null ? null : Math.round((initial+additional)*1000000)/1000000 : total;
          const info = { document_id:d.id,credit_rule:applicable[0],initial,additional,total,calculated,minimum,difference:total === null || calculated === null ? null : Math.round((total-calculated)*1000000)/1000000 };
          if (total === null || calculated === null) error('Data angka kredit belum lengkap.',info);
          else if (Math.abs(total-calculated)>0.000001) error('Total angka kredit berbeda dengan hasil perhitungan. Periksa dasar konversi, periode, AK sebelumnya dan PAK terakhir.',info);
          else if (calculated < minimum) error('Angka kredit belum memenuhi minimum menurut rule.',info);
          else emit('PASS','Angka kredit sesuai konfigurasi.',info);
        }
      } else if (c.kind === 'relevance') {
        if (!c.date_field || !dateValue(c.valid_from) || !dateValue(c.valid_until)) { emit('ERROR',POLICY_REQUIRED); continue; }
        if (!selected.length) { error('Dokumen untuk pemeriksaan masa berlaku belum tersedia.'); continue; }
        for (const d of selected) {
          const date = dateValue(val(d.extracted_document_data?.[c.date_field]));
          date && date>=c.valid_from && date<=c.valid_until ? emit('PASS','Tanggal dokumen relevan.',{document_id:d.id}) : error('Tanggal dokumen tidak memenuhi rentang yang dikonfigurasi.',{document_id:d.id});
        }
      } else emit('ERROR',POLICY_REQUIRED,{ reason:'Jenis rule tidak dikenali.' });
    }
    const counts = { PASS:0,WARNING:0,ERROR:0 };
    results.forEach(r=>counts[r.severity]++);
    return { overall_status:counts.ERROR ? 'FAILED':counts.WARNING ? 'NEEDS REVIEW':'PASS',counts,results };
  }
}
function appliesCredit(c,context,period) {
  return c.effective_start <= period.effective_date && (!c.effective_end || c.effective_end >= period.effective_date)
    && Object.entries(c.selectors || {}).every(([k,v])=>Array.isArray(v) && v.some(x=>normalized(x) === normalized(context[k])));
}
