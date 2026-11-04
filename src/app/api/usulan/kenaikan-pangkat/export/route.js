import { route,positiveId } from '@/lib/promotion/api';
import { recap,periodRecap } from '@/lib/promotion/service';
import { RECAP_COLUMNS,recapRows,buildPromotionWorkbook } from '@/lib/promotion/export';
export const runtime='nodejs';
export async function GET(request) { return route(request,async(db,user)=>{
  const params=new URL(request.url).searchParams;
  const result=params.get('period_id')
    ? await periodRecap(db,user,positiveId.parse(params.get('period_id')),request)
    : await recap(db,user,positiveId.parse(params.get('batch_id')),request);
  const rows=recapRows(result.items);
  if(params.get('format')==='json') return {batch:result.batch,columns:RECAP_COLUMNS,rows};
  const buffer=await buildPromotionWorkbook(result.items,result.batch);
  return new Response(buffer,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="LAMPIRAN-SURAT-USULAN-KP-${result.batch.id}.xlsx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}); }
