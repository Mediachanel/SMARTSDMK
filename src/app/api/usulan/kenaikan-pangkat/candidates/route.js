import { route } from '@/lib/promotion/api';
import { candidates } from '@/lib/promotion/service';
export async function GET(request) { return route(request,(db,user)=>candidates(db,user,(new URL(request.url).searchParams.get('q') || '').slice(0,200))); }
