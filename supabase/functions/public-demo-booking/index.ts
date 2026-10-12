// Synthetic-only public booking API. NO real guest data is accepted or stored.
// The database RPCs are service-role only and enforce demo slug, availability,
// idempotency and a basic 5-per-15-minute request budget.
const ORIGIN='https://alesyan-reservations.onrender.com';
const cors={ 'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'content-type,apikey,authorization','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}});
const supabaseUrl=Deno.env.get('SUPABASE_URL')!;
const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function digest(text:string){const bytes=new TextEncoder().encode(text);const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 if(req.headers.get('origin')!==ORIGIN)return json({error:'Untrusted origin'},403);
 const clen=Number(req.headers.get('content-length')||0);
 if(clen>1024)return json({error:'Request too large'},413);
 let data:Record<string,unknown>;
 try {data=await req.json();} catch{return json({error:'Invalid JSON'},400);}
 if(!data || typeof data!=='object' || Array.isArray(data))return json({error:'Invalid input'},400);
 const action=data.action;
 if(action!=='slots'&&action!=='book')return json({error:'Invalid operation'},400);
 if(data.slug!=='alesyan-demo-malahide')return json({error:'Demo venue only'},404);
 if(typeof data.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.date))return json({error:'Invalid date'},400);
 if(!Number.isInteger(data.party)||Number(data.party)<1||Number(data.party)>8)return json({error:'Invalid party size'},400);
 if(action==='book'&&(typeof data.time!=='string'||!/^\d{2}:(00|30)$/.test(data.time)
   || typeof data.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(data.requestId)))return json({error:'Invalid booking request'},400);
 const forwarded=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'anonymous';
 const ipHash=await digest(forwarded+':alesyan-reservations-demo-2026');
 const name=action==='book'?'public_demo_book':'public_demo_slots';
 const payload=action==='slots'
  ?{p_slug:data.slug,p_day:data.date,p_party:data.party}
  :{p_slug:data.slug,p_day:data.date,p_time:data.time,p_party:data.party,p_request:data.requestId,p_fingerprint:ipHash};
 try {
 const res=await fetch(supabaseUrl+'/rest/v1/rpc/'+name,{
   method:'POST',headers:{'apikey':serviceRole,'authorization':'Bearer '+serviceRole,'content-type':'application/json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)
 });
 const out=await res.json().catch(()=>null);
 if(!res.ok)return json({error:res.status===429?'Too many requests':String(out?.message||'Demo booking unavailable').slice(0,200)},res.status>=500?503:400);
 if(action==='slots')return json({slots:Array.isArray(out)?out.map((v:{slot:string})=>v.slot):[]});
 return json({reference:out});
 }catch{return json({error:'Demo booking temporarily unavailable'},503);}
});
