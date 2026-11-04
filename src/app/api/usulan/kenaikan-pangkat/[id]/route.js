import { route,body,actionSchema,positiveId } from '@/lib/promotion/api';
import { detail } from '@/lib/promotion/repository';
import { mutate } from '@/lib/promotion/service';
export async function GET(request,{params}) { return route(request,async(db,user)=>detail(db,user,positiveId.parse((await params).id))); }
export async function PATCH(request,{params}) { return route(request,async(db,user)=>mutate(db,user,positiveId.parse((await params).id),await body(request,actionSchema),request)); }
