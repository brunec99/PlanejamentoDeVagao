import { type NextRequest, NextResponse } from 'next/server';
import { listActivities, listProjects, PrevisionError } from '@/infrastructure/integrations/prevision/client';
export const runtime = 'nodejs';
// Until real application authentication exists, credential-backed queries are local-only.
// Cache here only reduces provider traffic in the local prototype; it is not durable storage.
const cache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
let lastRequest = 0;
export async function GET(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  const origin = request.headers.get('origin');
  if (process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1','[::1]'].includes(hostname) || (origin && origin !== request.nextUrl.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({error:'A integração está disponível apenas no ambiente local até configurar autenticação real.'},{status:403});
  }
  const projectId=request.nextUrl.searchParams.get('projectId');
  if(projectId!==null&&!/^\d+$/.test(projectId))return NextResponse.json({error:'Identificador de obra inválido.'},{status:400});
  const key=projectId??'projects';
  const cached=cache.get(key);
  if(cached&&cached.expires>Date.now())return NextResponse.json(cached.value,{headers:{'Cache-Control':'no-store'}});
  try {
    let promise=inflight.get(key);
    if(!promise) {
      if(Date.now()-lastRequest<11000)return NextResponse.json({error:'Aguarde 11 segundos entre consultas ao Prevision.'},{status:429,headers:{'Retry-After':'11'}});
      lastRequest=Date.now();
      promise=projectId?listActivities(projectId):listProjects().then(projects=>({projects}));
      inflight.set(key,promise);
    }
    const result=await promise;cache.set(key,{expires:Date.now()+60000,value:result});
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  } catch(error) { return NextResponse.json({error:error instanceof PrevisionError?error.message:'A resposta do Prevision não corresponde ao formato esperado.'},{status:error instanceof PrevisionError?error.status:502}); }
  finally { inflight.delete(key); }
}
