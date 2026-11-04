"use client";
import { useCallback,useEffect,useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus,LoaderCircle,Search,ClipboardCheck,Settings,RefreshCw,FileText,Download,Building2,Hospital,Landmark,Stethoscope } from 'lucide-react';
import dinkesLogo from '@/Foto/Dinkes.png';
import PageHeader from '@/components/layout/PageHeader';
import DataTable from '@/components/tables/DataTable';
import ActionDrawer from '@/components/ui/ActionDrawer';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import PromotionDetail,{API,Badge,requestJson} from '@/components/promotion/PromotionDetail';
import { has,canVerify,preEligibility } from '@/lib/promotion/policy';

const EMPTY={items:[],periods:[],types:[],units:[],batches:[],stats:[],returns:[],errors:[],returnReasons:[],statuses:[],user:{},total:0,pageSize:20};
const RANK_OPTIONS=[
  'Juru Muda (I/a)','Juru Muda Tingkat I (I/b)','Juru (I/c)','Juru Tingkat I (I/d)',
  'Pengatur Muda (II/a)','Pengatur Muda Tingkat I (II/b)','Pengatur (II/c)','Pengatur Tingkat I (II/d)',
  'Penata Muda (III/a)','Penata Muda Tingkat I (III/b)','Penata (III/c)','Penata Tingkat I (III/d)',
  'Pembina (IV/a)','Pembina Tingkat I (IV/b)','Pembina Utama Muda (IV/c)','Pembina Utama Madya (IV/d)','Pembina Utama (IV/e)'
];
function rankIndex(value='') {
  const text=value.toLowerCase();
  return RANK_OPTIONS.findIndex(rank=>{
    const golongan=rank.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
    return text.includes(rank.toLowerCase()) || (golongan && text.includes(golongan));
  });
}
function nextRankOptions(current) {
  const index=rankIndex(current);
  return index>=0?RANK_OPTIONS.slice(index+1):RANK_OPTIONS;
}
function shortRank(value='') {
  const text=String(value || '');
  return text.match(/\(([^)]+)\)/)?.[1] || text.match(/([IVX]+\/[a-e])/i)?.[1] || text || '-';
}
function formatDate(value) {
  if(!value) return '-';
  const date=new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID');
}
function serviceDuration(value) {
  const start=new Date(value);
  if(Number.isNaN(start.getTime())) return '-';
  const now=new Date();
  let years=now.getFullYear()-start.getFullYear();
  let months=now.getMonth()-start.getMonth();
  if(now.getDate()<start.getDate()) months--;
  if(months<0) { years--;months+=12; }
  return `${Math.max(0,years)} thn ${Math.max(0,months)} bln`;
}
function typeLabel(item,types=[]) {
  return types.find(t=>t.id===item.type_id)?.name || item.type_name || '-';
}
function isSubmissionOpen(period, now = new Date()) {
  if (period?.status !== 'OPEN') return false;
  const time = now.getTime();
  const start = Date.parse(period.submission_start);
  const end = Math.min(Date.parse(period.submission_end), Date.parse(period.ukpd_deadline));
  return Number.isFinite(start) && Number.isFinite(end) && time >= start && time <= end;
}
function periodWindowText(period) {
  if (!period) return '';
  const start = new Date(period.submission_start).toLocaleString('id-ID');
  const end = new Date(Math.min(Date.parse(period.submission_end), Date.parse(period.ukpd_deadline))).toLocaleString('id-ID');
  return `Pengajuan dibuka ${start} sampai ${end}.`;
}
const PROMOTION_FLOW=[
  {
    title:'Melalui Dinas Kesehatan Provinsi DKI Jakarta',
    tone:'border-dinkes-200 bg-dinkes-50',
    heading:'bg-lime-300 text-slate-950',
    destination:'Rekap usulan dikirim ke BKD Prov.',
    items:[
      {no:'01',title:'Kantor Dinas Kesehatan',rank:'Golongan IV/c ke bawah dan Golongan IV/c ke atas',icon:Landmark,accent:'bg-amber-300 text-slate-950'},
      {no:'02',title:'RSUD Kelas A, Kelas B & RSKD',rank:'Golongan IV/c ke bawah dan Golongan IV/c ke atas',icon:Hospital,accent:'bg-sky-300 text-slate-950'},
      {no:'03',title:'Unit Pelayanan Teknis (UPT)',rank:'Golongan IV/c ke bawah dan Golongan IV/c ke atas',icon:Building2,accent:'bg-lime-400 text-slate-950'},
      {no:'04',title:'Sudinkes Kota/Kabupaten',rank:'Golongan IV/c ke atas',icon:Building2,accent:'bg-fuchsia-300 text-slate-950'}
    ]
  },
  {
    title:'Melalui Suku Dinas Kesehatan Kota/Kabupaten Provinsi DKI Jakarta',
    tone:'border-sky-200 bg-sky-50',
    heading:'bg-lime-300 text-slate-950',
    destination:'Rekap usulan dikirim ke Suban BKD.',
    items:[
      {no:'01',title:'Kantor Sudinkes Kota/Kabupaten',rank:'Golongan IV/c ke bawah dan Golongan IV/c ke atas',icon:Building2,accent:'bg-amber-300 text-slate-950'},
      {no:'02',title:'RSUD Kelas C dan Kelas D',rank:'Golongan IV/c ke bawah dan Golongan IV/c ke atas',icon:Hospital,accent:'bg-sky-300 text-slate-950'},
      {no:'03',title:'Puskesmas',rank:'Golongan IV/c ke bawah dan Golongan IV/c ke atas',icon:Stethoscope,accent:'bg-lime-400 text-slate-950'}
    ]
  }
];
function PromotionFlowGuide() {
  return <section className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
    <div className="grid items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 text-center sm:grid-cols-[8rem_1fr_8rem]">
      <div className="hidden items-center gap-2 text-left sm:flex">
        <Image src={dinkesLogo} alt="Dinas Kesehatan DKI Jakarta" width={40} height={40} className="h-10 w-10 object-contain" />
        <span className="text-xs font-black leading-tight text-dinkes-800">Jakarta Sehat</span>
      </div>
      <h2 className="font-display text-xl font-black uppercase tracking-normal text-slate-950">Alur Usulan Kenaikan Pangkat</h2>
      <div className="hidden text-right text-xs font-black leading-tight text-rose-600 sm:block">
        BerAKHLAK
        <span className="block text-[10px] font-semibold text-slate-500">Bangga Melayani Bangsa</span>
      </div>
    </div>
    <div className="grid gap-3 p-3 lg:grid-cols-2">
      {PROMOTION_FLOW.map(group=><div key={group.title} className={`rounded-lg border p-3 ${group.tone}`}>
        <div className="mb-4 flex justify-center text-center">
          <h3 className={`max-w-md rounded-lg px-4 py-2 text-sm font-black leading-tight ${group.heading}`}>{group.title}</h3>
        </div>
        <div className="space-y-3">
          {group.items.map(item=>{
            const Icon=item.icon;
            return <article key={item.no} className="grid min-h-24 grid-cols-[4.25rem_1fr_auto] items-center gap-3 rounded-lg border border-white bg-white px-3 py-3 shadow-sm">
              <div className={`flex h-11 w-14 items-center justify-center rounded-lg text-lg font-black ${item.accent}`}>{item.no}</div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-slate-950">{item.title}</h4>
                <p className="mt-1 text-sm font-semibold leading-snug text-slate-700">{item.rank}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-dinkes-700">
                <Icon className="h-7 w-7" />
              </div>
            </article>;
          })}
        </div>
        <p className="mt-4 rounded-lg border border-white bg-white px-3 py-2 text-sm font-black text-dinkes-900">{group.destination}</p>
      </div>)}
    </div>
  </section>;
}
export default function PromotionPage() {
  const [data,setData]=useState(EMPTY),[filters,setFilters]=useState({page:1}),[search,setSearch]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState(null);
  const [selected,setSelected]=useState([]),[detail,setDetail]=useState(null),[create,setCreate]=useState(false),[candidateSearch,setCandidateSearch]=useState(''),[candidates,setCandidates]=useState([]),[finding,setFinding]=useState(false);
  const [employee,setEmployee]=useState(null),[period,setPeriod]=useState(''),[type,setType]=useState(''),[rank,setRank]=useState(''),[confirm,setConfirm]=useState(null);
  const notify=(text,error=false)=>setNotice({text,error});
  const load=useCallback(async()=>{
    setLoading(true);
    try { setData(await requestJson(`${API}?${new URLSearchParams(Object.entries(filters).filter(([,v])=>v!==''))}`)); }
    catch(error) { setNotice({text:error.message,error:true}); } finally { setLoading(false); }
  },[filters]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{const timer=setTimeout(()=>setFilters(f=>({...f,q:search,page:1})),300);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    if(!create) return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{setFinding(true);try {setCandidates(await requestJson(`${API}/candidates?q=${encodeURIComponent(candidateSearch)}`,{signal:controller.signal}));}catch(error){if(error.name!=='AbortError')setNotice({text:error.message,error:true});}finally{setFinding(false);}},250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[create,candidateSearch]);
  async function openDetail(id) { try {setDetail(await requestJson(`${API}/${id}`));}catch(error){notify(error.message,true);} }
  async function reloadDetail(id) { await openDetail(id);await load(); }
  async function createItem(e) {
    e.preventDefault();setBusy(true);
    try {
      const result=await requestJson(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id_pegawai:employee.id_pegawai,period_id:Number(period),type_id:Number(type),proposed_rank:rank})});
      setCreate(false);await load();await openDetail(result.id);notify('Draft usulan berhasil dibuat. Lanjutkan unggah dokumen.');
    } catch(error){notify(error.message,true);}finally{setBusy(false);}
  }
  async function batch(action) {
    setBusy(true);
    try {await requestJson(`${API}/batch`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,ids:selected})});setSelected([]);setConfirm(null);await load();notify(action==='recap'?'Rekap periode berhasil dibuat.':'Pemeriksaan batch selesai; hasil disimpan per pegawai.');}
    catch(error){notify(error.message,true);}finally{setBusy(false);}
  }
  function filter(key,value) {setFilters(f=>({...f,[key]:value,page:1}));setSelected([]);}
  const totalStatus=status=>data.stats.filter(s=>s.status===status).reduce((sum,s)=>sum+s.total,0);
  const totalValidation=value=>data.stats.filter(s=>s.overall_status===value).reduce((sum,s)=>sum+s.total,0);
  const activePeriods=data.periods.filter(p=>p.status==='OPEN');
  const selectedPeriod=activePeriods.find(p=>String(p.id)===period);
  const selectedPeriodOpen=selectedPeriod?isSubmissionOpen(selectedPeriod):false;
  const selectedType=data.types.find(t=>String(t.id)===type),precheck=employee?preEligibility(employee,selectedType):null;
  const proposedRankOptions=nextRankOptions(employee?.pangkat_golongan);
  const verify=has(data.user,'verify_sudin') || has(data.user,'verify_dinkes') || has(data.user,'correct_sudin');
  const mainStats=[['Total usulan',data.total],['Draft',totalStatus('DRAFT')],['Menunggu verifikasi',totalStatus('MENUNGGU_VERIFIKASI_SUDIN')+totalStatus('MENUNGGU_VERIFIKASI_DINKES')],['Siap diusulkan',totalStatus('SIAP_DIUSULKAN')],['Selesai',totalStatus('SELESAI')]];
  const systemStats=[['Sistem PASS',totalValidation('PASS')],['Perlu review',totalValidation('NEEDS REVIEW')],['Sistem ERROR',totalValidation('FAILED')],['Perlu perbaikan UKPD',totalStatus('PERLU_PERBAIKAN_UKPD')],['Ditolak',totalStatus('DITOLAK')]];
  const primarySelects=[['period_id','Semua periode',data.periods.map(p=>[p.id,p.effective_date])],['type_id','Semua jenis KP',data.types.map(t=>[t.id,t.name])],['status','Semua status',[...new Set([...data.statuses,'SELESAI','DITOLAK'])].map(s=>[s,s])]];
  const advancedSelects=[['ukpd_id','Semua UKPD',data.units.map(u=>[u.ukpd_id,u.name])],['validation','Semua hasil sistem',['PASS','NEEDS REVIEW','FAILED'].map(s=>[s,s])],['wilayah','Semua wilayah',['Jakarta Selatan','Jakarta Timur','Jakarta Barat','Jakarta Utara','Jakarta Pusat','Kepulauan Seribu'].map(s=>[s,s])]];
  const columns=[
    {key:'nama',header:'Nama',width:220,wrap:true,render:item=><div className="flex items-start gap-2">{verify && canVerify(data.user,item) && <input className="mt-1" aria-label={`Pilih ${item.employee_snapshot.nama}`} type="checkbox" checked={selected.includes(item.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>}<button className="text-left font-semibold text-dinkes-800" onClick={()=>openDetail(item.id)}>{item.employee_snapshot.nama}</button></div>},
    {key:'nip',header:'NIP',width:150,render:i=>i.employee_snapshot.nip || '-'},
    {key:'pendidikan',header:'Pendidikan terakhir',width:130,render:i=>i.employee_snapshot.jenjang_pendidikan || '-'},
    {key:'gol_lama',header:'Gol lama',width:95,align:'center',render:i=>shortRank(i.employee_snapshot.pangkat_golongan)},
    {key:'tmt_lama',header:'TMT lama',width:110,align:'center',render:i=>formatDate(i.employee_snapshot.tmt_pangkat_terakhir)},
    {key:'masa_kerja',header:'Masa kerja gol lama',width:130,align:'center',render:i=>serviceDuration(i.employee_snapshot.tmt_pangkat_terakhir)},
    {key:'gol_baru',header:'Gol baru',width:95,align:'center',render:i=>shortRank(i.proposed_rank)},
    {key:'tmt_baru',header:'TMT baru',width:110,align:'center',render:i=>formatDate(data.periods.find(p=>p.id===i.period_id)?.effective_date)},
    {key:'jabatan',header:'Jabatan terakhir',width:240,wrap:true,render:i=>i.employee_snapshot.jabatan || '-'},
    {key:'atasan',header:'Jabatan atasan langsung',width:240,wrap:true,render:i=>i.employee_snapshot.struktur_atasan_langsung || '-'},
    {key:'gol_atasan',header:'Gol atasan langsung',width:130,align:'center',render:i=>shortRank(i.employee_snapshot.golongan_atasan_langsung || i.employee_snapshot.pangkat_atasan_langsung)},
    {key:'unit',header:'Unit kerja',width:220,wrap:true,render:i=>i.employee_snapshot.nama_ukpd || '-'},
    {key:'jenis',header:'Jenis kenaikan pangkat',width:220,wrap:true,render:i=>typeLabel(i,data.types)}
  ];
  return <div className="space-y-4">
    <PageHeader title="Kenaikan Pangkat" showBreadcrumb={false} action={<div className="flex flex-wrap gap-2">{has(data.user,'configure') && <Link href="/usulan/kenaikan-pangkat/pengaturan" className="btn-secondary"><Settings className="h-4 w-4"/>Konfigurasi</Link>}{has(data.user,'create') && <button className="btn-primary" onClick={()=>{setEmployee(null);setRank('');setCreate(true);}}><Plus className="h-4 w-4"/>Tambah usulan</button>}<button className="btn-secondary" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4"/>Muat ulang</button></div>}/>
    {notice && <div role={notice.error?'alert':'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.error?'border-rose-200 bg-rose-50 text-rose-700':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.text}</div>}
    <PromotionFlowGuide />
    <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><strong>Periode aktif</strong>{activePeriods.length?activePeriods.map(p=><p key={p.id} className="mt-1">{new Date(`${p.effective_date}T00:00:00`).toLocaleDateString('id-ID',{month:'long',year:'numeric'})} · Batas UKPD: {new Date(p.ukpd_deadline).toLocaleString('id-ID')} · Batas Sudin: {new Date(p.sudin_deadline).toLocaleString('id-ID')} · Batas Dinas: {new Date(p.dinkes_deadline).toLocaleString('id-ID')} · OPEN</p>):<p className="mt-1">Belum ada periode terbuka. Pengelola perlu menetapkan periode dan deadline.</p>}</section>
    <section className="space-y-2"><div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{mainStats.map(([label,value])=><article key={label} className="surface p-3"><p className="text-xs text-slate-500">{label}</p><strong className="text-2xl text-dinkes-900">{value}</strong></article>)}</div><details className="surface p-3"><summary className="cursor-pointer text-sm font-semibold text-dinkes-900">Detail KPI pemeriksaan sistem</summary><div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">{systemStats.map(([label,value])=><article key={label} className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><strong className="text-xl text-dinkes-900">{value}</strong></article>)}</div></details></section>
    {!!data.notifications?.length && <details className="surface p-3"><summary className="cursor-pointer text-sm font-semibold text-dinkes-900">Notifikasi proses terbaru ({data.notifications.length})</summary><div className="mt-2 space-y-2">{data.notifications.map(n=><button key={n.id} className="block w-full border-t border-slate-100 py-2 text-left text-sm" onClick={()=>openDetail(n.submission_id)}><strong>{n.name}</strong> · {n.new_status}<span className="block text-xs text-slate-500">{n.created_at}</span></button>)}</div></details>}
    <section className="surface space-y-3 p-3"><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className="input pl-9" aria-label="Cari nama, NIP atau NRK" placeholder="Nama, NIP, NRK" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      {primarySelects.map(([key,label,options])=><select className="input" aria-label={label} key={key} value={filters[key] || ''} onChange={e=>filter(key,e.target.value)}><option value="">{label}</option>{options.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select>)}</div>
      <details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-dinkes-900">Filter lanjutan</summary><div className="mt-3 grid gap-2 md:grid-cols-3">{advancedSelects.map(([key,label,options])=><select className="input" aria-label={label} key={key} value={filters[key] || ''} onChange={e=>filter(key,e.target.value)}><option value="">{label}</option>{options.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select>)}{[['job','Jabatan (persis)'],['level','Jenjang (persis)'],['rank','Pangkat (persis)']].map(([key,label])=><input key={key} aria-label={label} className="input" placeholder={label} value={filters[key] || ''} onChange={e=>filter(key,e.target.value)}/>)}</div></details>
      {verify && <div className="flex flex-wrap items-center gap-2 text-sm"><span>{selected.length} dipilih</span><button className="btn-secondary disabled:opacity-50" disabled={busy || !selected.length} onClick={()=>setConfirm({action:'validate',title:'Jalankan Smart Validation untuk pilihan?'})}><ClipboardCheck className="h-4 w-4"/>Validasi pilihan</button><button className="btn-primary disabled:opacity-50" disabled={busy || !selected.length} onClick={()=>setConfirm({action:'recap',title:'Masukkan pilihan ke rekap periode?'})}>Buat rekap periode</button></div>}
    </section>
    {loading?<div className="surface flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin"/>Memuat usulan…</div>:<DataTable columns={columns} data={data.items} rowKey="id" showNumber startNumber={((filters.page || 1)-1)*data.pageSize+1} compact actionWidth={96} actions={item=><div className="flex items-center justify-center gap-1"><button type="button" className="rounded-md p-1.5 text-dinkes-700 hover:bg-dinkes-50 focus-ring" onClick={()=>openDetail(item.id)} aria-label="Lihat dokumen" title="Lihat dokumen"><FileText className="h-4 w-4"/></button><a className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50 focus-ring" href={`${API}/download?id=${item.id}`} aria-label="Download dokumen" title="Download dokumen"><Download className="h-4 w-4"/></a></div>}/>}
    <div className="flex items-center justify-between text-sm text-slate-600"><span>{data.total} usulan · halaman {filters.page || 1} dari {Math.max(1,Math.ceil(data.total/data.pageSize))}</span><div className="flex gap-2"><button className="btn-secondary disabled:opacity-50" disabled={loading || (filters.page || 1)<=1} onClick={()=>setFilters(f=>({...f,page:f.page-1}))}>Sebelumnya</button><button className="btn-secondary disabled:opacity-50" disabled={loading || (filters.page || 1)*data.pageSize>=data.total} onClick={()=>setFilters(f=>({...f,page:f.page+1}))}>Berikutnya</button></div></div>
    <section className="surface p-4"><h2 className="font-bold text-dinkes-900">Rekap usulan per periode</h2><p className="mb-3 text-xs text-slate-500">Export Excel mengikuti format lampiran surat usulan KP. Untuk Admin UKPD, isi rekap mengikuti usulan UKPD yang dapat diakses.</p>{data.periods.length?data.periods.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3 text-sm"><span>{new Date(`${p.effective_date}T00:00:00`).toLocaleDateString('id-ID',{month:'long',year:'numeric'})} · {p.status}</span><div className="flex flex-wrap gap-2"><a className="btn-secondary" href={`${API}/export?period_id=${p.id}`}>Export Excel</a><a className="btn-primary" href={`${API}/download?period_id=${p.id}`}>Download dokumen lengkap</a></div></div>):<p className="text-sm text-slate-500">Belum ada periode.</p>}</section>
    <section className="surface p-4"><h2 className="font-bold text-dinkes-900">Rekap batch verifikator</h2><p className="mb-3 text-xs text-slate-500">Rekap internal Sudin/Dinas untuk usulan yang sudah masuk rekap periode.</p>{data.batches.length?data.batches.map(b=><div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 py-3 text-sm"><span>{b.code} · {b.members} pegawai · {b.authority} · {b.wilayah}</span><div className="flex gap-2"><a className="btn-secondary" href={`${API}/export?batch_id=${b.id}`}>Export Excel</a><a className="btn-secondary" href={`${API}/download?batch_id=${b.id}`}>Download dokumen</a><Link className="btn-secondary" href={`/usulan/kenaikan-pangkat/rekap?batch_id=${b.id}`}>Export PDF / lihat rekap</Link></div></div>):<p className="text-sm text-slate-500">Belum ada rekap batch.</p>}</section>
    <ActionDrawer open={create} title="Tambah usulan kenaikan pangkat" description="1. Pilih PNS UKPD Anda → 2. Tentukan periode dan jenis KP → 3. Unggah dokumen pada detail usulan." onClose={()=>!busy && setCreate(false)}>
      {notice?.error && <p role="alert" className="mb-3 text-sm text-rose-700">{notice.text}</p>}
      {!employee?<div className="space-y-3"><input className="input" placeholder="Cari nama / NIP / NRK" aria-label="Cari PNS" value={candidateSearch} onChange={e=>setCandidateSearch(e.target.value)}/>{finding?<p className="text-sm">Mencari PNS…</p>:candidates.length?candidates.map(p=><button key={p.id_pegawai} className="surface block w-full p-3 text-left hover:bg-dinkes-50" onClick={()=>{setEmployee(p);setRank('');}}><strong className="text-sm">{p.nama}</strong><p className="text-xs text-slate-500">{p.nip} · {p.nrk} · {p.jabatan} · {p.nama_ukpd}</p></button>):<p className="text-sm text-slate-500">Tidak ada PNS yang sesuai. Periksa data pegawai dan hubungan UKPD.</p>}</div>:<form onSubmit={createItem} className="space-y-4">
        <div className="surface flex gap-4 p-4"><Image unoptimized src={employee.photo_url} alt={`Foto ${employee.nama}`} width={72} height={90} className="h-24 w-20 rounded-lg bg-slate-100 object-cover" onError={e=>{e.currentTarget.style.visibility='hidden';}}/><div className="text-sm"><strong>{employee.nama}</strong><p>{employee.nip} · NRK {employee.nrk} · {employee.jenis_pegawai}</p><p>{employee.nama_ukpd}</p><p>{employee.jabatan} · {employee.jenjang || 'Jenjang belum terbaca dari nama jabatan'}</p><p>{employee.pangkat_golongan} · TMT {employee.tmt_pangkat_terakhir || 'belum tersedia'}</p><p>Pendidikan: {employee.jenjang_pendidikan || '-'}</p><button type="button" className="mt-2 text-dinkes-700 underline" onClick={()=>setEmployee(null)}>Ganti pegawai</button></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm">Periode<select className="input" required value={period} onChange={e=>setPeriod(e.target.value)}><option value="">Pilih periode</option>{activePeriods.map(p=><option key={p.id} value={p.id}>{p.effective_date}{isSubmissionOpen(p)?'':' (belum dibuka)'}</option>)}</select>{selectedPeriod && !selectedPeriodOpen && <span className="text-xs text-amber-700">{periodWindowText(selectedPeriod)}</span>}</label><label className="grid gap-1 text-sm">Jenis KP<select className="input" required value={type} onChange={e=>setType(e.target.value)}><option value="">Pilih jenis KP</option>{data.types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="grid gap-1 text-sm">Pangkat usulan<select className="input" required value={rank} onChange={e=>setRank(e.target.value)}><option value="">Pilih pangkat usulan</option>{proposedRankOptions.map(option=><option key={option} value={option}>{option}</option>)}</select></label></div>
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4"><h3 className="font-bold text-blue-900">Smart Check awal</h3>{precheck.checks.map((c,i)=><p key={i} className="mt-2 text-sm"><Badge value={c.severity}/> {c.message}</p>)}<p className="mt-3 text-sm font-semibold">Potensi periode KP: {precheck.potentialPeriod || 'Belum dapat dihitung; perlu konfigurasi kebijakan.'}</p><p className="text-xs">Informasi awal, menunggu kelengkapan dokumen dan verifikasi.</p></section>
        <button disabled={busy || !employee || !period || !type || !rank || !selectedPeriodOpen} className="btn-primary disabled:opacity-50">{busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Buat draft dan lanjutkan dokumen</button>
      </form>}
    </ActionDrawer>
    {detail && <PromotionDetail key={detail.id} item={detail} user={data.user} returnReasons={data.returnReasons} onClose={()=>setDetail(null)} onReload={reloadDetail} onNotice={notify}/>}
    <ConfirmDeleteModal open={Boolean(confirm)} title={confirm?.title} description="Setiap usulan akan diperiksa kewenangan, periode dan hasil validasinya oleh server." tone="success" confirmLabel="Lanjutkan" loading={busy} onCancel={()=>setConfirm(null)} onConfirm={()=>batch(confirm.action)}/>
  </div>;
}
