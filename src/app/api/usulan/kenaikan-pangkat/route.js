import { route,body,createSchema } from '@/lib/promotion/api';
import { listing,createSubmission } from '@/lib/promotion/service';
export const runtime='nodejs';
export async function GET(request) { return route(request,(db,user)=>listing(db,user,Object.fromEntries(new URL(request.url).searchParams))); }
export async function POST(request) { return route(request,async(db,user)=>createSubmission(db,user,await body(request,createSchema),request)); }
