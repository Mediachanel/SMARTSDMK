import { route,body,batchSchema } from '@/lib/promotion/api';
import { batchValidate,createBatch } from '@/lib/promotion/service';
export async function POST(request) { return route(request,async(db,user)=>{
  const data=await body(request,batchSchema);
  return data.action==='validate'?batchValidate(db,user,data.ids,request):createBatch(db,user,data.ids,request);
}); }
