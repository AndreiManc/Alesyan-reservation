import { useEffect,useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2 } from 'lucide-react';
import { dateAfter,todayDublin } from './domain';
import './public-booking.css';

const apiUrl=(import.meta.env.VITE_SUPABASE_URL||'')+'/functions/v1/public-demo-booking';
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'';
const slug='alesyan-demo-malahide';
type Reply={slots?:string[];reference?:string;error?:string};
async function request(payload:Record<string,unknown>):Promise<Reply>{
 const res=await fetch(apiUrl,{method:'POST',headers:{'content-type':'application/json',apikey:key},body:JSON.stringify({slug,...payload})});
 const out=await res.json() as Reply;
 if(!res.ok)throw new Error(out.error||'Unable to contact the demo booking service');
 return out;
}
export default function PublicBooking(){
 const [date,setDate]=useState(todayDublin()),[party,setParty]=useState(2),[slots,setSlots]=useState<string[]>([]),
 [time,setTime]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),
 [reference,setReference]=useState('');
 useEffect(()=>{let cancelled=false;setSlots([]);setTime('');setError('');
 if(!date||date<todayDublin())return;
 setLoading(true);
 void request({action:'slots',date,party}).then(data=>{if(!cancelled)setSlots(data.slots||[]);})
 .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Could not load times');})
 .finally(()=>{if(!cancelled)setLoading(false);});
 return()=>{cancelled=true;};
 },[date,party]);
 async function submit(e:FormEvent){e.preventDefault();if(!time)return;setLoading(true);setError('');
 try{const id=crypto.randomUUID();const result=await request({action:'book',date,party,time,requestId:id});
 if(!result.reference)throw new Error('Could not confirm demo booking');
 setReference(result.reference);
 }catch(e){setError(e instanceof Error?e.message:'Unable to make demo booking');}
 finally{setLoading(false);}
 }
 return <div className="public-shell">
  <div className="public-container">
   <a className="public-back" href="/"><ArrowLeft size={17}/>Staff login</a>
   <header className="public-hero"><span className="public-eyebrow">ALESYAN RESERVE · CUSTOMER PREVIEW</span><h1>Alesyan Demo — Malahide</h1><p>Discover the online booking experience</p></header>
   <div className="public-warning"><strong>DEMONSTRATION ONLY.</strong> This is not Gourmet Food Parlour or a real restaurant reservation. All bookings are fictional test records. Do not enter any personal information.</div>
   {reference?
   <div className="public-card success"><CheckCircle2 size={39}/><h2>Test reservation confirmed</h2><p>Your fictional booking reference is <strong>{reference}</strong>.</p><p>It now appears in the secure staff reservation diary. No email or SMS was sent and no real restaurant will expect you.</p>
   <button className="public-primary" onClick={()=>{setReference('');setTime('');}}>Create another test reservation</button></div>
   :<form className="public-card" onSubmit={submit}>
    <h2>Find a table</h2><p className="public-muted">No account or personal details needed for this test.</p>
    <div className="public-input-row"><label>Date<input required type="date" min={todayDublin()} max={dateAfter(todayDublin(),45)} value={date} onChange={e=>setDate(e.target.value)}/></label>
    <label>Party size<select value={party} onChange={e=>setParty(Number(e.target.value))}>{Array.from({length:8},(_,i)=><option value={i+1} key={i}>{i+1} {i===0?'person':'people'}</option>)}</select></label></div>
    <h3>Available times</h3>
    {loading&&!slots.length?<p className="public-muted">Checking availability…</p>:
    <div className="public-slots">{slots.map(s=><button type="button" className={s===time?'selected':''} key={s} onClick={()=>setTime(s)}>{s}</button>)}{!slots.length&&!error&&<p className="public-muted">No tables available for this date. Try another day.</p>}</div>}
    {error&&<p className="public-error" role="alert">{error}</p>}
    <button className="public-primary" disabled={!time||loading} type="submit">{loading?'Processing…':'Confirm fictional booking'}</button>
    <p className="public-footer"><CalendarDays size={14}/> Reservations and availability are synchronised with the staff database.</p>
   </form>}
  </div>
 </div>;
}
