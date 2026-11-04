"use client";
import { useEffect,useState } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import ActionDrawer from '@/components/ui/ActionDrawer';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import ConfigurationForm,{configurationLabel} from '@/components/promotion/ConfigurationForm';
import { API,requestJson,Badge } from '@/components/promotion/PromotionDetail';

const KINDS={periods:'Jadwal pengajuan',requirements:'Dokumen persyaratan',types:'Jenis kenaikan pangkat',rules:'Aturan pemeriksaan',creditRules:'Ketentuan angka kredit',permissions:'Hak akses'};
const CONFIG={status:'REQUIRES_POLICY_CONFIGURATION',selectors:{},regulation_reference:''};
const FORM_KINDS=['periods','types','requirements','creditRules'];
const TEMPLATES={
  periods:()=>({year:new Date().getFullYear(),month:1,effective_date:`${new Date().getFullYear()}-01-01`,submission_start:null,submission_end:null,ukpd_deadline:null,sudin_deadline:null,dinkes_deadline:null,status:'DRAFT'}),
  types:()=>({code:'',name:'',enabled:true,configuration:{...CONFIG,confidence_threshold:0.9}}),
  requirements:()=>({code:'',name:'',enabled:true,configuration:{...CONFIG,required:true}}),
  creditRules:()=>({code:'',name:'',enabled:true,configuration:{...CONFIG,method:'sum',minimum:null,effective_start:null,effective_end:null,regulation_reference:''}}),
  rules:()=>({rule_code:'',rule_name:'',category:'POLICY',regulation_reference:'TODO POLICY REVIEW',severity:'ERROR',applicable_promotion_type:null,applicable_job_category:null,effective_start:new Date().toISOString().slice(0,10),effective_end:null,configuration:{kind:'rank',status:'REQUIRES_POLICY_CONFIGURATION',transitions:[]},enabled:true}),
  permissions:()=>({role_code:'ADMIN_UKPD',capabilities:['read_own','create','edit']})
};
function clean(kind,item) {
  return Object.fromEntries(Object.keys(TEMPLATES[kind]()).map(key=>{
    let value=item[key] ?? null;
    if(kind==='periods' && ['submission_start','submission_end','ukpd_deadline','sudin_deadline','dinkes_deadline'].includes(key) && value) value=new Date(value).toISOString();
    return [key,value];
  }));
}
export default function ConfigurationPage() {
  const [data,setData]=useState(null),[kind,setKind]=useState('periods'),[edit,setEdit]=useState(null),[draft,setDraft]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[advanced,setAdvanced]=useState(false),[technical,setTechnical]=useState(false);
  async function load(){try {setData(await requestJson(`${API}/configuration`));}catch(error){setNotice(error.message);}}
  useEffect(()=>{load();},[]);
  function open(item){setTechnical(false);setEdit(item || {});setDraft(JSON.stringify(item?clean(kind,item):TEMPLATES[kind](),null,2));setNotice('');}
  async function save(){setBusy(true);try{const values=JSON.parse(draft);if(!edit.id && ['types','requirements','creditRules'].includes(kind) && !values.code) values.code=`KP_${crypto.randomUUID().replaceAll('-','').toUpperCase()}`;await requestJson(`${API}/configuration`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id:edit.id,values})});setConfirm(false);setEdit(null);setNotice('Konfigurasi tersimpan dan tercatat pada audit log. Jalankan ulang validasi usulan yang terdampak.');await load();}catch(error){setNotice(error.message);setConfirm(false);}finally{setBusy(false);}}
  return <div className="space-y-4"><PageHeader title="Pengaturan Kenaikan Pangkat" description="Pengaturan jadwal, dokumen persyaratan, dan kebijakan oleh Super Admin." breadcrumbs={[{label:'Kenaikan Pangkat',href:'/usulan/kenaikan-pangkat'},{label:'Pengaturan'}]}/>
    {notice && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Mulai dari <strong>jadwal pengajuan</strong> dan <strong>dokumen persyaratan</strong>. Alur verifikasi mengikuti role akun: Admin UKPD mengusulkan, Admin Wilayah memverifikasi wilayah, dan Super Admin/Dinas mengelola tahap Dinas.</div>
    {data && <><div className="flex flex-wrap gap-2">{Object.entries(KINDS).filter(([key])=>advanced || ['periods','requirements'].includes(key)).map(([key,label])=><button className={kind===key?'btn-primary':'btn-secondary'} key={key} onClick={()=>setKind(key)}>{label}</button>)}</div>
      <button className="text-sm text-blue-700 underline" onClick={()=>{setAdvanced(!advanced);setKind('periods');}}>{advanced?'Tutup pengaturan lanjutan':'Tampilkan pengaturan lanjutan (jenis, aturan, dan hak akses)'}</button>
      <section className="surface p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{KINDS[kind]}</h2><button className="btn-primary" onClick={()=>open(null)}>Tambah</button></div>
        {data[kind]?.length?data[kind].map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3"><div className="text-sm"><strong>{item.name || item.rule_name || item.nama_ukpd || ({ADMIN_UKPD:'Admin unit kerja',ADMIN_WILAYAH:'Admin wilayah',SUPER_ADMIN:'Super Admin'}[item.role_code]) || (item.effective_date?new Date(item.effective_date).toLocaleDateString('id-ID',{month:'long',year:'numeric'}):'Pengaturan')}</strong>{item.version && <p className="text-xs text-slate-500">Versi {item.version}</p>}</div><Badge value={configurationLabel(item.status || item.configuration?.status || (item.enabled===false?'Tidak aktif':'Aktif'))}/><button className="btn-secondary" onClick={()=>open(item)}>Ubah</button></div>):<p className="text-sm text-slate-500">Belum dikonfigurasi.</p>}
      </section>
      {advanced && <details className="surface p-4"><summary className="cursor-pointer font-semibold">Panduan teknis untuk pengelola sistem</summary><div className="mt-3 space-y-3 text-sm text-slate-600"><p><strong>Periode:</strong> effective_date adalah tanggal 1 sesuai year/month. Untuk OPEN, isi submission_start, submission_end, ukpd_deadline, sudin_deadline dan dinkes_deadline. Format jam: 2026-10-01T08:00:00+07:00.</p><p><strong>Verifikasi:</strong> alur pemeriksaan mengikuti role akun dan wilayah master UKPD. Admin UKPD mengusulkan dari UKPD sendiri, Admin Wilayah memverifikasi wilayahnya, dan Super Admin mengelola tahap Dinas.</p><p><strong>Selectors:</strong> objek filter dengan key type, job_category, job, rank, level atau period. Setiap nilai berupa daftar string; semua filter harus cocok. Contoh struktur: {JSON.stringify({type:['JF'],level:['Ahli Pertama']})}. Persyaratan yang tidak berlaku sebaiknya diberi selectors atau dinonaktifkan.</p><p><strong>Jenis KP:</strong> minimum_rank_months hanya diisi jika aturan masa pangkat telah disahkan; dipakai untuk potensi periode informasional. confidence_threshold 0â€“1 menentukan kebutuhan review dokumen.</p><p><strong>Rule pangkat:</strong> kind rank memakai transitions berupa daftar objek from/to. SKP memakai allowed_ratings dan required_years. Relevansi dokumen memakai date_field, valid_from dan valid_until. Match memakai field, employee_field dan document_codes. Set applicable_promotion_type/job_category agar rule JF tidak diterapkan pada jenis lain.</p><p><strong>Angka kredit:</strong> configuration memerlukan status CONFIGURED, method sum (awal + tambahan) atau total, minimum numerik, selectors, effective_start/end, dan regulation_reference. Jangan mengisi minimum berdasarkan perkiraan.</p><p><strong>Persyaratan:</strong> required menentukan wajib/tidak; dokumen SK_KP_TERBIT dipakai setelah persetujuan dan tidak boleh diwajibkan pada pengajuan awal.</p><p><strong>Permission:</strong> role tetap mengikuti sistem login. Batas UKPD dan wilayah tidak dapat diperluas lewat konfigurasi ini. correct_sudin hanya untuk koreksi khusus Super Admin.</p></div></details>}

    </>}
    <ActionDrawer open={Boolean(edit)} title={`${edit?.id?'Ubah':'Tambah'} ${KINDS[kind]}`} description="Isi pengaturan berikut sesuai ketentuan yang berlaku." onClose={()=>!busy && setEdit(null)}>{notice && <p role="alert" className="mb-3 text-sm text-rose-700">{notice}</p>}{!technical && FORM_KINDS.includes(kind) && <ConfigurationForm kind={kind} value={JSON.parse(draft || '{}')} units={data?.units || []} existing={Boolean(edit?.id)} onChange={value=>setDraft(JSON.stringify(value,null,2))}/>}
      {FORM_KINDS.includes(kind) && <button className="my-4 block text-sm text-blue-700 underline" onClick={()=>{try{JSON.parse(draft);setTechnical(!technical);}catch{setNotice('Data teknis belum valid. Periksa isian sebelum kembali ke formulir.');}}}>{technical?'Kembali ke formulir':'Buka editor teknis (pengelola sistem)'}</button>}
      {(technical || ['rules','permissions'].includes(kind)) && <label className="grid gap-2 text-sm">Pengaturan teknis, khusus pengelola sistem<textarea spellCheck={false} className="input min-h-[420px] font-mono text-xs" value={draft} onChange={e=>setDraft(e.target.value)}/></label>}
      <button className="btn-primary mt-4" disabled={busy} onClick={()=>{try{JSON.parse(draft);setConfirm(true);}catch{setNotice('JSON belum valid. Periksa tanda kutip dan koma.');}}}>Simpan konfigurasi</button></ActionDrawer>
    <ConfirmDeleteModal open={confirm} title="Simpan perubahan kebijakan?" description="Perubahan tercatat pada audit log dan dapat membuat hasil validasi aktif perlu diperiksa ulang." tone="success" confirmLabel="Simpan" loading={busy} onCancel={()=>setConfirm(false)} onConfirm={save}/>
  </div>;
}

