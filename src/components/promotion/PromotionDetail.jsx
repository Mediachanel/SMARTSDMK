"use client";
import { useState } from 'react';
import { LoaderCircle,UploadCloud,CheckCircle2,AlertTriangle,Eye,ExternalLink } from 'lucide-react';
import ActionDrawer from '@/components/ui/ActionDrawer';
import PdfDocumentPreview from '@/components/ui/PdfDocumentPreview';
import ConfirmDeleteModal from '@/components/ui/ConfirmDeleteModal';
import { canEdit,canVerify,canRecap } from '@/lib/promotion/policy';
import { WORKFLOW } from '@/lib/promotion/workflow';

export const API='/api/usulan/kenaikan-pangkat';
export async function requestJson(url,options={}) {
  const response=await fetch(url,{cache:'no-store',...options});
  const payload=await response.json().catch(()=>null);
  if(!response.ok || !payload?.success) throw new Error(payload?.message || 'Permintaan tidak dapat diproses.');
  return payload.data;
}
export function Badge({value}) {
  const tone=['PASS','SELESAI','DISETUJUI'].includes(value)?'bg-emerald-100 text-emerald-800':['ERROR','FAILED','DITOLAK','PERLU_PERBAIKAN_UKPD'].includes(value)?'bg-rose-100 text-rose-800':'bg-amber-100 text-amber-900';
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${tone}`}>{value || 'Belum diperiksa'}</span>;
}
const ACTIONS={submit:'Ajukan ke verifikator',return:'Kembalikan ke UKPD',approve:'Setujui verifikasi',ready:'Tandai siap diusulkan',send_bkd:'Catat dikirim ke BKD',send_bkn:'Catat dikirim ke BKN',return_bkd:'Catat pengembalian BKD',return_bkn:'Catat pengembalian BKN',accept:'Catat persetujuan',issue_sk:'Catat SK terbit',finish:'Selesaikan',reject:'Tolak usulan'};
const FIELDS=['nama','nip','nomor_sk','tanggal_sk','pangkat','tmt_pangkat','jabatan','jenjang','tmt_jabatan','periode_awal','periode_akhir','angka_kredit_awal','angka_kredit_baru','angka_kredit_tambahan','total_angka_kredit','tanggal_pak','pejabat_penetap','nilai_skp','tahun_skp'];

export default function PromotionDetail({item,user,returnReasons,onClose,onReload,onNotice}) {
  const [busy,setBusy]=useState(false),[note,setNote]=useState(''),[preview,setPreview]=useState(null),[confirm,setConfirm]=useState(null);
  const [rank,setRank]=useState(item.proposed_rank),[review,setReview]=useState(null),[fields,setFields]=useState({});
  const [localNotice,setLocalNotice]=useState(null);
  const [reason,setReason]=useState(''),[returnedAt,setReturnedAt]=useState(''),[subcategory,setSubcategory]=useState(''),[relatedDocument,setRelatedDocument]=useState('');
  const [verificationDecision,setVerificationDecision]=useState(''),[repairDeadline,setRepairDeadline]=useState('');
  const edit=canEdit(user,item),verify=canVerify(user,item),recap=canRecap(user,item);
  const errors=item.run?.counts?.ERROR || 0;
  const previewUrl=preview?`${API}/${item.id}/documents?document_id=${preview.id}`:'';
  const deliveryTarget=item.authority==='SUDIN'?'Suban BKD':'BKD Prov.';
  async function perform(fn) {
    setBusy(true);
    try { await fn();await onReload(item.id);onNotice('Perubahan berhasil disimpan.');setLocalNotice({text:'Perubahan berhasil disimpan.'});setConfirm(null);return true; }
    catch(error) { onNotice(error.message,true);setLocalNotice({text:error.message,error:true});return false; } finally { setBusy(false); }
  }
  function action(name,extra={}) {
    return perform(()=>requestJson(`${API}/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,revision:item.revision,note,...extra})}));
  }
  function docAction(name,doc,extra={}) {
    return perform(async()=>{
      await requestJson(`${API}/${item.id}/documents`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,document_id:doc.id,note,...extra})});
      if(name==='delete' && preview?.id===doc.id) setPreview(null);
    });
  }
  async function upload(event,requirement,replaceId) {
    const file=event.target.files?.[0];if(!file) return;
    const form=new FormData();form.set('file',file);form.set('requirement_id',requirement.id);if(replaceId) form.set('replace_id',replaceId);
    await perform(()=>requestJson(`${API}/${item.id}/documents`,{method:'POST',body:form}));event.target.value='';
  }
  function beginReview(doc) {
    setReview(doc);setFields(Object.fromEntries(FIELDS.map(key=>[key,{extracted_value:doc.extracted_document_data?.[key]?.extracted_value ?? '',page:doc.extracted_document_data?.[key]?.page || 1}])));
  }
  function verificationNote(decision) {
    return [`Hasil verifikasi: ${decision}.`, note.trim(), repairDeadline ? `Batas akhir perbaikan: ${repairDeadline}.` : ''].filter(Boolean).join('\n');
  }
  function actionLabel(name,label) {
    if(name==='send_bkd') return `Catat dikirim ke ${deliveryTarget}`;
    return label;
  }
  const availableActions=Object.entries(ACTIONS).filter(([name])=>WORKFLOW[name]?.includes(item.status) && (name==='submit'?edit:verify) && (!['send_bkd','send_bkn','return_bkd','return_bkn','accept','issue_sk','finish'].includes(name) || recap));
  const visibleActions=availableActions.filter(([name])=>!verify || !['approve','return'].includes(name));
  const canApproveNow=availableActions.some(([name])=>name==='approve') && item.run && !item.run.stale && errors===0;
  const canReturnNow=availableActions.some(([name])=>name==='return');
  return <>
    <ActionDrawer open title={`Usulan Kenaikan Pangkat — ${item.employee_snapshot.nama}`} description={`${item.employee_snapshot.nip} · ${item.employee_snapshot.nama_ukpd}`} onClose={busy?()=>{}:onClose}>
      <div className="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)]">
        <section className="min-h-80 rounded-lg bg-slate-800 p-3 lg:sticky lg:top-0 lg:h-[calc(92vh-9rem)]">
          {previewUrl ? (
            <div className="h-[60vh] min-h-80 lg:h-full">
              <PdfDocumentPreview url={previewUrl} title={preview.name} />
            </div>
          ) : (
            <div className="flex h-full min-h-80 items-center justify-center rounded-lg border border-dashed border-slate-500 px-6 text-center text-sm font-medium text-slate-200">
              Pilih dokumen yang sudah diunggah untuk melihat preview PDF.
            </div>
          )}
        </section>
        <div className="min-h-0 space-y-5 lg:max-h-[calc(92vh-9rem)] lg:overflow-y-auto lg:pr-1">
        {localNotice && <p role={localNotice.error?'alert':'status'} className={`rounded-lg border p-3 text-sm ${localNotice.error?'border-rose-200 bg-rose-50 text-rose-700':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{localNotice.text}</p>}
        <div className="flex flex-wrap items-center gap-3"><Badge value={item.status}/><Badge value={item.run?.overall_status}/><span className="text-sm text-slate-600">Periode {item.period.effective_date} · Verifikator {item.authority}</span></div>
        <section className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {[['Jabatan',item.employee.jabatan],['Jenjang jabatan',item.employee.jenjang],['Pangkat saat ini',item.employee.pangkat_golongan],['TMT pangkat',item.employee.tmt_pangkat_terakhir],['Pendidikan',item.employee.jenjang_pendidikan],['NRK',item.employee.nrk],['Pangkat usulan',item.proposed_rank],['TMT usulan',item.period.effective_date]].map(([label,value])=><div key={label}><p className="text-xs text-slate-500">{label}</p><p className="text-sm font-semibold">{value || 'Belum tersedia'}</p></div>)}
        </section>
        {edit && <form className="surface flex flex-wrap gap-3 p-4" onSubmit={e=>{e.preventDefault();action('edit',{proposed_rank:rank});}}><label className="grid flex-1 gap-1 text-sm">Pangkat usulan<input required maxLength={120} className="input" value={rank} onChange={e=>setRank(e.target.value)}/></label><button className="btn-secondary self-end" disabled={busy}>Simpan / sinkronkan data pegawai</button></form>}
        <section className="space-y-3">
          <div><h3 className="font-bold text-dinkes-900">Dokumen persyaratan</h3><p className="text-xs text-slate-500">PDF maksimal 10 MB, 30 halaman. Verifikasi dokumen terlebih dahulu, kemudian jalankan pemeriksaan sistem.</p></div>
          {item.requirements.map(requirement=>{
            const docs=item.documents.filter(d=>d.requirement_id===requirement.id);
            const mayUpload=edit || (verify && item.status==='DISETUJUI' && requirement.code==='SK_KP_TERBIT');
            return <article key={requirement.id} className="surface space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-semibold">{requirement.name} <span className="text-xs font-normal text-slate-500">{requirement.configuration.required?'Wajib':'Jika diperlukan'}</span></div>
                {mayUpload && <label className={`btn-secondary cursor-pointer text-xs ${busy?'pointer-events-none opacity-50':''}`}><UploadCloud className="h-4 w-4"/>Tambah PDF<input type="file" className="sr-only" accept="application/pdf,.pdf" disabled={busy} onChange={e=>upload(e,requirement)}/></label>}
              </div>
              {!docs.length && <p className="text-xs text-slate-500">Belum ada dokumen.</p>}
              {docs.map(doc=>{
                const documentUrl=`${API}/${item.id}/documents?document_id=${doc.id}`;
                return <div key={doc.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button type="button" className={`btn-secondary text-xs ${preview?.id===doc.id?'border-dinkes-600 bg-dinkes-700 text-white hover:bg-dinkes-800':''}`} onClick={()=>setPreview(doc)}><Eye className="h-4 w-4"/>Tampilkan Dokumen</button>
                  <a className="btn-secondary text-xs" href={documentUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4"/>Lihat Dokumen Penuh</a>
                  <span className="max-w-[280px] truncate font-medium text-slate-500">{doc.name} · {Math.ceil(doc.size/1024)} KB</span>
                  <Badge value={doc.verified_by?'PASS':doc.extraction_status}/>
                  {edit && <><label className={`btn-secondary cursor-pointer text-xs ${busy?'pointer-events-none opacity-50':''}`}>Ganti PDF<input type="file" className="sr-only" accept="application/pdf,.pdf" disabled={busy} onChange={e=>upload(e,requirement,doc.id)}/></label><button type="button" disabled={busy} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50" onClick={()=>setConfirm({label:'Hapus dokumen',fn:()=>docAction('delete',doc)})}>Hapus Dokumen</button></>}
                  {verify && <><button disabled={busy} className="btn-secondary text-xs" onClick={()=>beginReview(doc)}>Periksa hasil ekstraksi</button><button disabled={busy || Boolean(doc.verified_by) || !['EXTRACTED','REVIEWED'].includes(doc.extraction_status)} className="btn-secondary text-xs disabled:opacity-50" onClick={()=>setConfirm({label:'Verifikasi dokumen',fn:()=>docAction('verify',doc)})}><CheckCircle2 className="h-4 w-4"/>Verifikasi</button></>}
                </div>
                {Object.keys(doc.extracted_document_data || {}).length>0 && <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">{Object.entries(doc.extracted_document_data).map(([key,f])=><div key={key}><dt className="text-slate-500">{key.replaceAll('_',' ')}</dt><dd className="font-medium">{String(f.extracted_value)} <span className="text-slate-500">· {Math.round(f.confidence*100)}% · hal. {f.page} · {f.extraction_method}</span></dd></div>)}</dl>}
              </div>;
              })}
            </article>;
          })}
        </section>
        <section className="surface space-y-3 p-4">
          {item.run?.stale && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Data, dokumen atau kebijakan berubah setelah pemeriksaan terakhir. Jalankan ulang Smart Validation sebelum melanjutkan.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-dinkes-900">Smart Validation — Hasil Pemeriksaan Sistem</h3><p className="text-xs text-slate-500">Hasil sistem tidak menggantikan keputusan pejabat/pengelola kepegawaian.</p></div>{verify && <button disabled={busy} className="btn-primary" onClick={()=>action('validate')}>{busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:null}Jalankan Smart Validation</button>}</div>
          {item.run?<><div className="flex flex-wrap gap-3">{Object.entries(item.run.counts).map(([key,count])=><div className="rounded-lg border border-slate-200 px-3 py-2 text-sm" key={key}><Badge value={key}/> <strong>{count}</strong></div>)}</div><p className="text-xs text-slate-500">Pemeriksaan #{item.run.id} · {item.run.created_at} · revisi {item.run.revision}</p>
            {item.run.results.map(result=><article className="rounded-lg border border-slate-200 p-3" key={result.id}><div className="flex flex-wrap items-center gap-2"><Badge value={result.severity}/><strong className="text-sm">{result.message}</strong></div><p className="mt-1 text-xs text-slate-500">Rule {result.rule_code} · versi {result.details.version || 'sistem'} · {result.details.regulation_reference || 'Pemeriksaan data dan kelengkapan'}</p>
              {result.details.actual!==undefined && <p className="mt-1 text-xs">Dokumen: {String(result.details.actual)} · Master: {String(result.details.expected ?? '-')}</p>}
              {result.details.minimum!==undefined && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><strong>SMART AK VALIDATOR</strong><dl className="mt-2 grid gap-2 sm:grid-cols-3">{[['AK awal',result.details.initial],['AK tambahan',result.details.additional],['Total dokumen',result.details.total],['Total perhitungan',result.details.calculated],['AK minimum',result.details.minimum],['Selisih',result.details.difference]].map(([k,v])=><div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd>{v ?? 'Belum tersedia'}</dd></div>)}</dl></div>}
              {result.details.missing?.length>0 && <p className="text-xs">Belum tersedia: {result.details.missing.join(', ')}</p>}
              {result.severity==='WARNING' && <p className="mt-2 text-xs">{result.acknowledged_by?`Diakui oleh ${result.acknowledged_by}: ${result.acknowledgement_note}`:verify?<button disabled={busy || !note.trim()} className="btn-secondary text-xs disabled:opacity-50" onClick={()=>action('acknowledge',{result_id:result.id})}>Akui warning dengan catatan</button>:'Menunggu acknowledgement validator.'}</p>}
            </article>)}
          </>:<p className="text-sm text-slate-500">Belum ada pemeriksaan sistem.</p>}
        </section>
        <section className="surface space-y-3 p-4"><label className="grid gap-1 text-sm font-semibold">Catatan validator / alasan perbaikan<textarea className="input min-h-24" maxLength={3000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Wajib untuk pengembalian, penolakan, pemeriksaan manual, dan acknowledgement warning"/></label>
          {verify && <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-bold text-dinkes-900">Kertas kerja verifikasi</h3>
            <p className="mt-1 text-xs text-slate-500">Pilih hasil pemeriksaan. Jika tidak valid, isi komentar dan batas akhir perbaikan untuk dikirim ke UKPD/Sudin terkait.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border bg-white p-3 text-sm font-semibold ${verificationDecision==='valid'?'border-emerald-400 ring-2 ring-emerald-100':'border-slate-200'}`}>
                <input type="checkbox" checked={verificationDecision==='valid'} onChange={e=>setVerificationDecision(e.target.checked?'valid':'')} />
                Valid
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border bg-white p-3 text-sm font-semibold ${verificationDecision==='invalid'?'border-rose-400 ring-2 ring-rose-100':'border-slate-200'}`}>
                <input type="checkbox" checked={verificationDecision==='invalid'} onChange={e=>setVerificationDecision(e.target.checked?'invalid':'')} />
                Tidak valid
              </label>
            </div>
            <label className="mt-3 grid gap-1 text-xs font-semibold">Batas Akhir Perbaikan
              <input className="input" type="datetime-local" value={repairDeadline} onChange={e=>setRepairDeadline(e.target.value)} />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-primary disabled:opacity-50" disabled={busy || verificationDecision!=='valid' || !canApproveNow} onClick={()=>setConfirm({label:'Tetapkan hasil valid?',fn:()=>action('approve',{note:verificationNote('VALID')})})}>Lulus / lanjut</button>
              <button type="button" className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50" disabled={busy || verificationDecision!=='invalid' || !canReturnNow || !note.trim() || !repairDeadline} onClick={()=>setConfirm({label:'Kirim perbaikan?',fn:()=>action('return',{note:verificationNote('TIDAK VALID')})})}>Tidak valid / kirim perbaikan</button>
            </div>
          </section>}
          {recap && ['DIUSULKAN_KE_BKD','DIUSULKAN_KE_BKN'].includes(item.status) && <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs">Kategori pengembalian<select className="input" value={reason} onChange={e=>setReason(e.target.value)}><option value="">Pilih kategori</option>{returnReasons.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="grid gap-1 text-xs">Tanggal pengembalian<input className="input" type="datetime-local" value={returnedAt} onChange={e=>setReturnedAt(e.target.value)}/></label><label className="grid gap-1 text-xs">Subkategori<input className="input" value={subcategory} onChange={e=>setSubcategory(e.target.value)}/></label><label className="grid gap-1 text-xs">Dokumen terkait<select className="input" value={relatedDocument} onChange={e=>setRelatedDocument(e.target.value)}><option value="">Tanpa dokumen terkait</option>{item.documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>}
          {errors>0 && <p role="alert" className="flex items-center gap-2 text-sm text-rose-700"><AlertTriangle className="h-4 w-4"/>Usulan belum dapat diteruskan karena masih terdapat {errors} kesalahan yang harus diperbaiki.</p>}
          <div className="flex flex-wrap gap-2">{visibleActions.map(([name,label])=><button disabled={busy || (['approve','ready','send_bkd','send_bkn','accept','issue_sk','finish'].includes(name) && (!item.run || item.run.stale || errors>0))} key={name} className="btn-secondary disabled:opacity-50" onClick={()=>setConfirm({label:actionLabel(name,label),fn:()=>action(name,name.startsWith('return_')?{reason_id:Number(reason),returned_at:returnedAt?new Date(returnedAt).toISOString():undefined,subcategory,document_id:relatedDocument?Number(relatedDocument):undefined}:{})})}>{actionLabel(name,label)}</button>)}{verify && ['MASUK_REKAP_PERIODE','DIUSULKAN_KE_BKD','DIUSULKAN_KE_BKN','DISETUJUI','SK_TERBIT'].includes(item.status) && <button className="btn-secondary" disabled={busy || !item.run || item.run.stale || errors>0} onClick={()=>action('confirm_review')}>Konfirmasi verifikasi ulang</button>}</div>
        </section>
        <section className="surface p-4"><h3 className="font-bold text-dinkes-900">Timeline proses</h3><ol className="mt-3 space-y-3">{item.timeline.map(event=><li key={event.id} className="border-l-2 border-dinkes-200 pl-4 text-sm"><strong>{event.new_status}</strong><p className="text-xs text-slate-500">{event.created_at} · {event.actor} · {event.role} · {event.action}</p>{event.note && <p className="mt-1">{event.note}</p>}</li>)}</ol></section>
        {!!item.returns.length && <section className="surface p-4"><h3 className="font-bold">Riwayat pengembalian BKD/BKN</h3>{item.returns.map(r=><p key={r.id} className="mt-2 text-sm">{r.returned_at} · {r.institution} · {r.category} · {r.subcategory}<br/>{r.note}</p>)}</section>}
        </div>
      </div>
    </ActionDrawer>
    <ActionDrawer open={Boolean(review)} title="Pemeriksaan manual hasil dokumen" description="Cocokkan nilai dan nomor halaman dengan PDF. Nilai kosong tidak disimpan. Data master pegawai tidak berubah." onClose={()=>setReview(null)}>
      <form onSubmit={e=>{e.preventDefault();docAction('review',review,{fields:Object.fromEntries(Object.entries(fields).filter(([,f])=>String(f.extracted_value).trim()))}).then(ok=>{if(ok)setReview(null);});}} className="space-y-4">
        {localNotice?.error && <p role="alert" className="text-sm text-rose-700">{localNotice.text}</p>}
        <p className="text-sm text-slate-600">Isi catatan pemeriksaan pada panel usulan sebelum menyimpan. Format tanggal: YYYY-MM-DD; angka kredit: desimal dengan titik.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FIELDS.map(key=><label className="grid gap-1 text-xs" key={key}>{key.replaceAll('_',' ')}<input className="input" value={fields[key]?.extracted_value ?? ''} onChange={e=>setFields(v=>({...v,[key]:{...v[key],extracted_value:e.target.value}}))}/><span className="flex items-center gap-2">Halaman <input aria-label={`Halaman ${key}`} className="input w-20" type="number" min="1" max="30" value={fields[key]?.page || 1} onChange={e=>setFields(v=>({...v,[key]:{...v[key],page:Number(e.target.value)}}))}/></span></label>)}</div>
        <button className="btn-primary" disabled={busy || !note.trim()}>Simpan pemeriksaan manual</button>
      </form>
    </ActionDrawer>
    <ConfirmDeleteModal open={Boolean(confirm)} title={confirm?.label} description="Perubahan akan dicatat dalam riwayat dan audit usulan." confirmLabel="Konfirmasi" tone="success" loading={busy} onCancel={()=>setConfirm(null)} onConfirm={()=>confirm?.fn()}/>
  </>;
}
