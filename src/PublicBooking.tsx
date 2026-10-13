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
 const widgetParams=new URLSearchParams(window.location.search);
 const initialDate=widgetParams.get('date');
 const initialParty=Number(widgetParams.get('party'));
 const initialTime=widgetParams.get('time');
 const amendmentToken=widgetParams.get('amend');
 const isAmendment=Boolean(amendmentToken&&/^[0-9a-f-]{36}$/i.test(amendmentToken));
 const [date,setDate]=useState(initialDate&&/^\d{4}-\d{2}-\d{2}$/.test(initialDate)&&initialDate>=todayDublin()?initialDate:todayDublin()),[party,setParty]=useState(Number.isInteger(initialParty)&&initialParty>=1&&initialParty<=12?initialParty:2),[slots,setSlots]=useState<string[]>([]),
 [time,setTime]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),
 [amendUrl,setAmendUrl]=useState(''),[cardChoice,setCardChoice]=useState<'decline'|'provide'>('decline'),[reference,setReference]=useState(''),[firstName,setFirstName]=useState(''),[lastName,setLastName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState('');
 useEffect(()=>{let cancelled=false;setSlots([]);setTime('');setError('');
 if(!date||date<todayDublin()||party>=10)return;
 setLoading(true);
 void request({action:'slots',date,party}).then(data=>{if(!cancelled)setSlots(data.slots||[]);})
 .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Could not load times');})
 .finally(()=>{if(!cancelled)setLoading(false);});
 return()=>{cancelled=true;};
 },[date,party]);
 async function submit(e:FormEvent){e.preventDefault();if(!time)return;if(party>=10){setError('A secure card guarantee is required for 10 or more guests. Online large-party bookings are unavailable until the restaurant enables its payment provider. Please contact the restaurant.');return;}if(cardChoice==='provide'){setError('Secure card collection is not connected in this demonstration. Choose No card, or return when card guarantees become available.');return;}if(!isAmendment&&(!lastName.trim()||phone.replace(/[^0-9]/g,'').length<7)){setError('A test last name and valid sample phone number are required.');return;}setLoading(true);setError('');
 try{const id=isAmendment?amendmentToken!:crypto.randomUUID();const result=await request(isAmendment?{action:'amend',date,party,time,requestId:id,token:id}:{action:'book',date,party,time,requestId:id});
 if(!result.reference)throw new Error('Could not confirm demo booking');
 setReference(result.reference);
 setAmendUrl(window.location.origin+'/book/alesyan-demo-malahide?amend='+encodeURIComponent(id));
 }catch(e){setError(e instanceof Error?e.message:'Unable to make demo booking');}
 finally{setLoading(false);}
 }
 return <div className="public-shell">
  <div className="public-container">
   <a className="public-back" href="/"><ArrowLeft size={17}/>Staff login</a>
   <header className="public-hero"><span className="public-eyebrow">ALESYAN RESERVE · CUSTOMER PREVIEW</span><h1>Alesyan Demo — Malahide</h1><p>Discover the online booking experience</p></header>
   <div className="public-warning"><strong>DEMONSTRATION ONLY.</strong> This is not Gourmet Food Parlour or a real restaurant reservation. All bookings are fictional test records. Do not enter any personal information.</div>
   {reference?
   <div className="public-card success"><CheckCircle2 size={39}/><h2>{isAmendment?'Test reservation amended':'Test reservation confirmed'}</h2><p>Your fictional booking reference is <strong>{reference}</strong>.</p><p>It now appears in the secure staff reservation diary. No email or SMS was sent and no real restaurant will expect you.</p><p><strong>Save your private amendment link</strong> to change the date, time or party size later. Anyone with this link can amend the fictional reservation.</p><a className="public-amend-link" href={amendUrl}>{amendUrl}</a>
   <button className="public-primary" onClick={()=>{setReference('');setTime('');}}>{isAmendment?'Make another change':'Create another test reservation'}</button></div>
   :<form className="public-card" onSubmit={submit}>
    <h2>{isAmendment?'Amend your test booking':'Find a table'}</h2><p className="public-muted">No account or personal details needed for this test.</p>
    <div className="public-input-row"><label>Date<input required type="date" min={todayDublin()} max={dateAfter(todayDublin(),45)} value={date} onChange={e=>setDate(e.target.value)}/></label>
    <label>Party size<select value={party} onChange={e=>setParty(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1} {i===0?'person':'people'}</option>)}</select></label></div>
    <h3>Available times</h3>
    {loading&&!slots.length?<p className="public-muted">Checking availability…</p>:
    <div className="public-slots">{slots.map(s=><button type="button" className={s===time?'selected':''} key={s} onClick={()=>setTime(s)}>{s}</button>)}{!slots.length&&!error&&<p className="public-muted">No tables available for this date. Try another day.</p>}</div>}
    {isAmendment&&<label className="public-time-edit">Requested time <input aria-label="Amendment requested time" type="time" step="1800" required value={time} onChange={e=>setTime(e.target.value)}/><small>Time changes are checked against actual table capacity when you confirm.</small></label>}
    {!isAmendment&&<><h3>Card guarantee</h3>
    {party>=10?<div className="public-warning" role="status"><strong>Card required for 10+ guests.</strong> Secure card collection is not yet enabled. Online confirmation is unavailable; restaurant managers may record a documented exception through the staff portal.</div>:<fieldset className="public-card-choice"><legend>Would you like to provide a card guarantee?</legend><label><input type="radio" name="cardChoice" checked={cardChoice==='decline'} onChange={()=>setCardChoice('decline')}/> No card — continue without a card</label><label><input type="radio" name="cardChoice" checked={cardChoice==='provide'} onChange={()=>setCardChoice('provide')}/> Provide a card (not available during testing)</label></fieldset>}
    {!isAmendment&&<><h3>Booking details</h3>
    <p className="public-muted">Use invented test information only. Details entered here are validated for the booking form demonstration but are not transmitted or saved.</p>
    <div className="public-input-row">
      <label>First name<input value={firstName} maxLength={80} onChange={e=>setFirstName(e.target.value)} placeholder="Sample"/></label>
      <label>Last name (required)<input required value={lastName} maxLength={80} onChange={e=>setLastName(e.target.value)} placeholder="Guest"/></label>
      <label>Phone number (required)<input required type="tel" value={phone} maxLength={30} onChange={e=>setPhone(e.target.value)} placeholder="Use a test number"/></label>
      <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} placeholder="Optional test email"/></label>
    </div>
    </>}
    </>}
    {isAmendment&&<p className="public-muted">Changes are confirmed only after a new capacity check. The original booking stays unchanged if the amendment cannot fit.</p>}
    {error&&<p className="public-error" role="alert">{error}</p>}
    <button className="public-primary" disabled={!time||loading||party>=10||(!isAmendment&&cardChoice==='provide')} type="submit">{loading?'Processing…':isAmendment?'Confirm changes':'Confirm fictional booking'}</button>
    <p className="public-footer"><CalendarDays size={14}/> Reservations and availability are synchronised with the staff database.</p>
   </form>}
  </div>
 </div>;
}
