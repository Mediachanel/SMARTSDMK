import { z } from 'zod';
import { route,body,positiveId } from '@/lib/promotion/api';
import { getConfiguration,saveConfiguration } from '@/lib/promotion/configuration';
export async function GET(request) { return route(request,(db,user)=>getConfiguration(db,user)); }
export async function POST(request) { return route(request,async(db,user)=>{
  const data=await body(request,z.object({kind:z.string(),id:positiveId.optional(),values:z.record(z.unknown())}).strict());
  return saveConfiguration(db,user,data.kind,data.id,data.values,request);
}); }
