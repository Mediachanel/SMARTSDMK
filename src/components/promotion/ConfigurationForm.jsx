"use client";

const STATES={DRAFT:'Draf',OPEN:'Dibuka',CLOSED:'Ditutup',CONFIGURED:'Sudah diperiksa',REQUIRES_POLICY_CONFIGURATION:'Belum diperiksa'};
export function configurationLabel(value){return STATES[value] || value;}
const DEADLINES={submission_start:'Pengajuan dibuka',submission_end:'Pengajuan ditutup',ukpd_deadline:'Batas pengajuan unit kerja',sudin_deadline:'Batas pemeriksaan Sudin',dinkes_deadline:'Batas pemeriksaan Dinas Kesehatan'};
const WILAYAH=['Jakarta Pusat','Jakarta Utara','Jakarta Barat','Jakarta Selatan','Jakarta Timur','Kepulauan Seribu'];
function jakarta(value){return value?new Date(new Date(value).getTime()+7*3600000).toISOString().slice(0,16):'';}
function inferOrganization(unit) {
  const name=(unit?.nama_ukpd || '').toLowerCase();
  const wilayah=unit?.wilayah || null;
  if(name.includes('dinas kesehatan') && !name.includes('suku dinas')) return {organization_type:'DINAS',promotion_verification_authority:'DINKES',wilayah:'Provinsi',hospital_class:null};
  if(name.includes('suku dinas') || name.includes('sudinkes')) return {organization_type:'SUDIN',promotion_verification_authority:'SUDIN',wilayah,hospital_class:null};
  if(name.includes('rsud') || name.includes('rumah sakit') || name.includes('rskd')) {
    const hospitalClass=name.includes('kelas a') ? 'A' : name.includes('kelas b') ? 'B' : name.includes('kelas d') ? 'D' : 'C';
    const authority=name.includes('rskd') || ['A','B'].includes(hospitalClass) ? 'DINKES' : 'SUDIN';
    return {organization_type:'RSUD',promotion_verification_authority:authority,wilayah:authority==='DINKES'?'Provinsi':wilayah,hospital_class:hospitalClass};
  }
  if(name.includes('puskesmas')) return {organization_type:'PUSKESMAS',promotion_verification_authority:'SUDIN',wilayah,hospital_class:null};
  return {organization_type:'UPT',promotion_verification_authority:'DINKES',wilayah,hospital_class:null};
}

export default function ConfigurationForm({kind,value,onChange,units=[],existing}) {
  const set=(key,next)=>onChange({...value,[key]:next});
  const config=(key,next)=>set('configuration',{...value.configuration,[key]:next});
  const field=(label,key,type='text',nested=false)=> <label className="grid gap-1 text-sm" key={key}>{label}<input className="input" type={type} value={(nested?value.configuration?.[key]:value[key])??''} onChange={e=>(nested?config:set)(key,type==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value || null)}/></label>;
  const select=(label,key,options)=> <label className="grid gap-1 text-sm">{label}<select className="input" value={value[key]??''} onChange={e=>set(key,e.target.value || null)}>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>;
  if(kind==='periods') return <div className="space-y-4"><label className="grid gap-1 text-sm">Bulan kenaikan pangkat<input className="input" type="month" min="2025-01" max="2200-12" required value={`${value.year}-${String(value.month).padStart(2,'0')}`} onChange={e=>{if(e.target.value){const [year,month]=e.target.value.split('-').map(Number);onChange({...value,year,month,effective_date:`${e.target.value}-01`});}}}/></label><p className="text-sm text-slate-500">Tanggal mulai pangkat otomatis tanggal 1. Semua waktu menggunakan WIB. Lengkapi seluruh batas waktu sebelum membuka periode.</p>{Object.entries(DEADLINES).map(([key,label])=><label className="grid gap-1 text-sm" key={key}>{label} (WIB)<input className="input" type="datetime-local" value={jakarta(value[key])} onChange={e=>set(key,e.target.value?`${e.target.value}:00+07:00`:null)}/></label>)}{select('Status periode','status',['DRAFT','OPEN','CLOSED'].map(s=>[s,STATES[s]]))}</div>;
  if(kind==='organizations') {
    const unit=units.find(u=>Number(u.id_ukpd)===Number(value.ukpd_id));
    return <div className="space-y-4">
      <label className="grid gap-1 text-sm">Unit kerja
        <select required className="input" value={value.ukpd_id || ''} onChange={e=>{
          const selected=units.find(u=>String(u.id_ukpd)===e.target.value);
          const inferred=inferOrganization(selected);
          onChange({...value,ukpd_id:Number(e.target.value),...inferred,configuration:value.configuration || {job_levels:{}}});
        }}><option value="">Pilih unit kerja</option>{units.map(u=><option key={u.id_ukpd} value={u.id_ukpd}>{u.nama_ukpd}</option>)}</select>
      </label>
      {unit && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <strong>{unit.nama_ukpd}</strong>
        <p className="mt-1">Wilayah dari master UKPD: {unit.wilayah || 'belum terisi'}.</p>
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {select('Kelompok unit','organization_type',[['DINAS','Dinas Kesehatan'],['SUDIN','Suku Dinas Kesehatan'],['PUSKESMAS','Puskesmas'],['UPT','UPT / unit lain'],['RSUD','RSUD / rumah sakit']])}
        {select('Alur pemeriksaan','promotion_verification_authority',[['SUDIN','Diperiksa Sudin sesuai wilayah'],['DINKES','Diperiksa Dinas Kesehatan']])}
      </div>
      {value.organization_type==='RSUD' && select('Kelas rumah sakit','hospital_class',[['','Pilih kelas'],...['A','B','C','D'].map(s=>[s,`Kelas ${s}`])])}
      <label className="grid gap-1 text-sm">Wilayah pembina
        <select className="input" value={value.wilayah ?? ''} onChange={e=>set('wilayah',e.target.value || null)}>
          <option value="">Pilih wilayah</option>
          <option value="Provinsi">Provinsi</option>
          {WILAYAH.map(w=><option key={w} value={w}>{w}</option>)}
        </select>
      </label>
      <p className="text-sm text-slate-500">Saat unit dipilih, kelompok unit, alur pemeriksaan dan wilayah diisi otomatis dari nama serta master UKPD. Ubah hanya bila hasil otomatis belum sesuai.</p>
    </div>;
  }
  if(!['types','requirements','creditRules'].includes(kind)) return null;
  return <div className="space-y-4">{field('Nama','name')}{!existing && <p className="text-sm text-slate-500">Nomor pengenal dibuat otomatis saat disimpan.</p>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.enabled} onChange={e=>set('enabled',e.target.checked)}/>Aktif digunakan</label>{kind==='requirements' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.configuration.required} onChange={e=>config('required',e.target.checked)}/>Dokumen wajib dilampirkan</label>}{field('Dasar aturan (nomor atau judul peraturan)','regulation_reference','text',true)}<label className="grid gap-1 text-sm">Pemeriksaan dasar aturan<select className="input" value={value.configuration.status} onChange={e=>config('status',e.target.value)}>{['REQUIRES_POLICY_CONFIGURATION','CONFIGURED'].map(s=><option key={s} value={s}>{STATES[s]}</option>)}</select></label>{kind==='creditRules' && <><label className="grid gap-1 text-sm">Cara menghitung angka kredit<select className="input" value={value.configuration.method} onChange={e=>config('method',e.target.value)}><option value="sum">Angka kredit awal + tambahan</option><option value="total">Gunakan angka kredit total</option></select></label>{field('Angka kredit minimum','minimum','number',true)}{field('Mulai berlaku','effective_start','date',true)}{field('Berlaku sampai (opsional)','effective_end','date',true)}</>}<p className="text-sm text-slate-500">Batas penerapan dan aturan khusus yang sudah tersimpan tetap digunakan. Periksa bagian teknis jika perlu mengubahnya.</p></div>;
}
