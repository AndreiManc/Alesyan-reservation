import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { CalendarDays, LayoutGrid, Users, Settings2, Plus, LogOut, RefreshCw, ShieldCheck, X, ArrowLeft, AlertCircle, ClipboardList } from 'lucide-react';
import { supabase } from './lib/supabase';
import { dublinDate, dublinClock, describeError } from './lib/database-types';
import type { Membership, Site, DbSettings, DbTable, DbArea, DbGuest, DbBooking } from './lib/database-types';
import { todayDublin } from './domain';
import './staff.css';

type View='overview'|'diary'|'floor'|'guests'|'settings';
type Editor={id?:string;firstName:string;lastName:string;phone:string;email:string;date:string;time:string;party:number;source:string;notes:string;preferredTableId:string};
const navItems:Array<{id:View;label:string;icon:typeof CalendarDays}>=[
 {id:'overview',label:'Overview',icon:LayoutGrid},{id:'diary',label:'Reservation diary',icon:ClipboardList},
 {id:'floor',label:'Floor & tables',icon:LayoutGrid},{id:'guests',label:'Guests',icon:Users},{id:'settings',label:'Settings',icon:Settings2}
];
const sources=['Phone','Website','Walk-in','OpenTable (historic)','Other'];
const stat=['confirmed','seated','completed','cancelled','no-show'];
const makeEditor=(date:string):Editor=>({firstName:'',lastName:'',phone:'',email:'',date,time:'18:00',party:2,source:'Phone',notes:'',preferredTableId:''});
const noncancelled=(r:DbBooking)=>r.status!=='cancelled'&&r.status!=='no-show';
const dayFromIso=(s:string)=>dublinDate(s);
const clockFromIso=(s:string)=>dublinClock(s);
function isManager(role:string){return role==='owner'||role==='manager';}
function Label({title,children}:{title:string;children:React.ReactNode}) {return <label className="field"><span>{title}</span>{children}</label>;}
function Notice({text,onClose}:{text:string;onClose:()=>void}){return <div className="notice live-notice" role="status"><AlertCircle size={17}/>{text}<button onClick={onClose} aria-label="Dismiss notice">×</button></div>;}
function Login({onSignIn}:{onSignIn:()=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[mode,setMode]=useState<'login'|'register'>('login'),[notice,setNotice]=useState('');
 async function submit(e:FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setErr('');setNotice('');try{
  if(mode==='register'){
   const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});
   if(error)throw error;
   if(data.user && !data.session) setNotice('Account request sent. Check your email to confirm it, then sign in. A site administrator must separately assign your restaurant before any bookings are visible.');
   else setNotice('Account created. An administrator must approve your restaurant membership before bookings are visible.');
  } else {
   const {error}=await supabase.auth.signInWithPassword({email,password});
   if(error)throw error;onSignIn();
  }
 }catch(e){setErr(describeError(e));}finally{setBusy(false);}}
 return <div className="auth-screen"><form className="auth-card" onSubmit={submit}>
  <div className="auth-logo">A</div><div className="eyebrow">ALESYAN RESERVE</div>
  <h1>{mode==='register'?'Create test staff account':'Staff sign in'}</h1><p className="muted">Development-only access. Accounts cannot view restaurant data until separately approved for a location.</p>
  <Label title="Work email"><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></Label>
  <Label title="Password"><input type="password" minLength={8} autoComplete={mode==='register'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} required/></Label>
  {err&&<p className="error">{err}</p>}{notice&&<div className="notice" role="status">{notice}</div>}
  <button className="button primary wide" disabled={busy}>{busy?'Processing…':mode==='register'?'Create test account':'Sign in'}</button>
  <button className="button ghost wide" type="button" disabled={busy} onClick={()=>{setMode(mode==='register'?'login':'register');setPassword('');setErr('');setNotice('');}}>{mode==='register'?'Already registered? Sign in':'Create a test staff account'}</button>
  <div className="auth-note"><ShieldCheck size={16}/> No real customer data. Staff access requires site membership granted separately; creating an account does not grant administrator rights.</div>
 </form></div>;
}
export default function StaffApp(){
 const api=supabase!;
 const [session,setSession]=useState<Session|null>(null),[checking,setChecking]=useState(true);
 const [membership,setMembership]=useState<Membership[]>([]),[sites,setSites]=useState<Site[]>([]),[siteId,setSiteId]=useState('');
 const [role,setRole]=useState(''),[view,setView]=useState<View>('overview'),[day,setDay]=useState(todayDublin());
 const [settings,setSettings]=useState<DbSettings|null>(null),[tables,setTables]=useState<DbTable[]>([]),[areas,setAreas]=useState<DbArea[]>([]);
 const [reservations,setReservations]=useState<DbBooking[]>([]),[guests,setGuests]=useState<DbGuest[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[feedback,setFeedback]=useState('');
 const [editor,setEditor]=useState<Editor|null>(null),[statusFilter,setStatusFilter]=useState('all'),[query,setQuery]=useState('');
 const [tableName,setTableName]=useState(''),[tableCapacity,setTableCapacity]=useState(2),[tableArea,setTableArea]=useState('Main Dining');
 const [draftSettings,setDraftSettings]=useState<DbSettings|null>(null); const [pairs,setPairs]=useState<Array<{id:string;table_a:string;table_b:string;enabled:boolean}>>([]); const [pairA,setPairA]=useState(''),[pairB,setPairB]=useState('');
 useEffect(()=>{let mounted=true;void api.auth.getSession().then(({data,error})=>{if(!mounted)return;if(error)setFeedback(error.message);setSession(data.session);setChecking(false);});
 const {data:sub}=api.auth.onAuthStateChange((_event,s)=>{if(mounted)setSession(s);});
 return()=>{mounted=false;sub.subscription.unsubscribe();};},[api]);
 useEffect(()=>{if(!session?.user.id){setMembership([]);setSites([]);setSiteId('');return;}
 let active=true;
 void (async()=>{const m=await api.from('site_memberships').select('site_id,role').eq('user_id',session.user.id);
 if(!active)return;if(m.error){setFeedback(m.error.message);return;}
 const ms=(m.data??[]) as Membership[];setMembership(ms);
 if(!ms.length){setSites([]);setSiteId('');return;}
 const s=await api.from('sites').select('id,name,timezone').in('id',ms.map(v=>v.site_id));
 if(!active)return;if(s.error){setFeedback(s.error.message);return;}
 const list=(s.data??[]) as Site[];setSites(list);setSiteId(prev=>list.some(i=>i.id===prev)?prev:(list[0]?.id??''));
 })();return()=>{active=false;};},[api,session?.user.id]);
 const selected=sites.find(s=>s.id===siteId);
 useEffect(()=>{setRole(membership.find(m=>m.site_id===siteId)?.role??'');},[membership,siteId]);
 const load=useCallback(async()=>{
 if(!siteId)return;setLoading(true);
 try{
 const first=new Date(day+'T00:00:00Z').getTime();
 const start=new Date(first-86400000).toISOString(),end=new Date(first+172800000).toISOString();
 const [sr,tr,ar,rr]=await Promise.all([
 api.from('site_settings').select('*').eq('site_id',siteId).single(),
 api.from('dining_tables').select('*').eq('site_id',siteId).order('label'),
 api.from('dining_areas').select('*').eq('site_id',siteId),
 api.from('reservations').select('*').eq('site_id',siteId).gte('starts_at',start).lt('starts_at',end).order('starts_at')
 ]);
 for(const result of [sr,tr,ar,rr]) if(result.error)throw result.error;
 const found=(rr.data??[]) as DbBooking[];
 const guestIds=[...new Set(found.map(r=>r.guest_id))];
 let guestRows:DbGuest[]=[];
 if(guestIds.length){const gr=await api.from('guests').select('id,site_id,full_name,phone,email').eq('site_id',siteId).in('id',guestIds);
 if(gr.error)throw gr.error;guestRows=(gr.data??[]) as DbGuest[];}
 setSettings(sr.data as DbSettings);setDraftSettings(sr.data as DbSettings);
 setTables((tr.data??[]) as DbTable[]);setAreas((ar.data??[]) as DbArea[]);
 setReservations(found.filter(r=>dayFromIso(r.starts_at)===day));setGuests(guestRows); const pr=await api.from('table_join_pairs').select('id,table_a,table_b,enabled').eq('site_id',siteId);if(!pr.error)setPairs(pr.data??[]);
 }catch(e){setFeedback('Could not load restaurant data: '+describeError(e));}finally{setLoading(false);}
 },[api,siteId,day]);
 useEffect(()=>{void load();},[load]);
 const guestName=useCallback((id:string)=>guests.find(g=>g.id===id)?.full_name??'Guest',[guests]);
 const tableNameFor=useCallback((id:string)=>tables.find(t=>t.id===id)?.label??'—',[tables]);
 const active=reservations.filter(noncancelled),covers=active.reduce((n,b)=>n+b.party_size,0);
 const list=useMemo(()=>reservations.filter(r=>(statusFilter==='all'||r.status===statusFilter)&&[guestName(r.guest_id),r.source,r.notes,tableNameFor(r.dining_table_id)].join(' ').toLowerCase().includes(query.toLowerCase())),[reservations,query,statusFilter,guestName,tableNameFor]);
 async function saveReservation(e:FormEvent){e.preventDefault();if(!editor||!siteId)return;setBusy(true);setFeedback('');
 try{
 const {error}=await api.rpc('staff_auto_allocate_booking',{
  p_site:siteId,p_first:editor.firstName.trim(),p_last:editor.lastName.trim(),p_phone:editor.phone.trim(),p_email:editor.email.trim(),p_day:editor.date,p_time:editor.time+':00',
  p_party:editor.party,p_source:editor.source,p_notes:editor.notes,
  p_preferred:editor.preferredTableId||null,p_existing:editor.id??null,
  p_request:editor.id?null:crypto.randomUUID()
 });
 if(error)throw error;
 setEditor(null);setFeedback('Reservation saved securely.');await load();
 }catch(e){setFeedback(describeError(e));}finally{setBusy(false);}
 }
 function editReservation(r:DbBooking){const guest=guests.find(g=>g.id===r.guest_id);const words=(guest?.full_name??'').trim().split(/\s+/);setEditor({id:r.id,firstName:words.slice(0,-1).join(' '),lastName:words.at(-1)??'',phone:guest?.phone??'',email:guest?.email??'',date:dayFromIso(r.starts_at),time:clockFromIso(r.starts_at),party:r.party_size,source:r.source,notes:r.notes,preferredTableId:r.dining_table_id});}
 async function setStatus(id:string,status:string){setBusy(true);setFeedback('');try{
 const {error}=await api.rpc('staff_change_reservation_status',{p_reservation_id:id,p_status:status});if(error)throw error;await load();
 setFeedback('Status updated and recorded in the audit history.');
 }catch(e){setFeedback(describeError(e));}finally{setBusy(false);}}
 async function saveTable(e:FormEvent){e.preventDefault();if(!isManager(role))return;setBusy(true);try{
 const {error}=await api.rpc('staff_upsert_table',{p_site_id:siteId,p_label:tableName.trim(),p_capacity:tableCapacity,p_area:tableArea,p_active:true,p_table_id:null});
 if(error)throw error;setTableName('');setFeedback('Table created.');await load();
 }catch(e){setFeedback(describeError(e));}finally{setBusy(false);}}
 async function toggleTable(t:DbTable){if(!isManager(role))return;setBusy(true);try{
 const area=areas.find(a=>a.id===t.area_id)?.name??'Main Dining';
 const {error}=await api.rpc('staff_upsert_table',{p_site_id:siteId,p_label:t.label,p_capacity:t.capacity,p_area:area,p_active:!t.active,p_table_id:t.id});
 if(error)throw error;await load();setFeedback('Table availability updated.');
 }catch(e){setFeedback(describeError(e));}finally{setBusy(false);}}
 async function saveRules(t:DbTable,movable:boolean,large:boolean){setBusy(true);try{const {error}=await api.rpc('staff_set_table_rules',{p_site:siteId,p_table:t.id,p_movable:movable,p_allow_large:large});if(error)throw error;await load();setFeedback('Automatic table rules saved.');}catch(e){setFeedback(describeError(e));}finally{setBusy(false);}}
 async function savePair(e:FormEvent){e.preventDefault();setBusy(true);try{const {error}=await api.rpc('staff_set_join_pair',{p_site:siteId,p_table_a:pairA,p_table_b:pairB,p_enabled:true});if(error)throw error;await load();setFeedback('Movable table pair enabled.');}catch(e){setFeedback(describeError(e));}finally{setBusy(false);}}
 async function disablePair(a:string,b:string){setBusy(true);try{const {error}=await api.rpc('staff_set_join_pair',{p_site:siteId,p_table_a:a,p_table_b:b,p_enabled:false});if(error)throw error;await load();}catch(e){setFeedback(describeError(e));}finally{setBusy(false);}}
 async function saveSettings(e:FormEvent){e.preventDefault();if(!draftSettings||!isManager(role))return;setBusy(true);try{
 const s=draftSettings;
 const {error}=await api.rpc('staff_update_settings',{
 p_site_id:siteId,p_lunch_from:s.lunch_from,p_lunch_to:s.lunch_to,p_dinner_from:s.dinner_from,p_dinner_to:s.dinner_to,
 p_small:s.small_duration_mins,p_large:s.large_duration_mins,p_buffer:s.turnover_buffer_mins,
 p_max_party:s.max_party_size,p_advance:s.max_advance_days
 });if(error)throw error;await load();setFeedback('Service settings updated.');
 }catch(e){setFeedback(describeError(e));}finally{setBusy(false);}}
 if(checking)return <div className="loading-screen">Checking secure session…</div>;
 if(!session)return <Login onSignIn={()=>setFeedback('Signed in successfully.')}/>;
 if(!sites.length)return <div className="auth-screen"><div className="auth-card"><div className="auth-logo">A</div><h1>No restaurant assigned</h1><p>Your account is signed in but has no approved site membership. An administrator must assign a restaurant before you can see bookings.</p><p className="muted tiny">{session.user.email}</p><button className="button outline" onClick={()=>api.auth.signOut()}>Sign out</button></div></div>;
 return <div className="shell staff-shell">
  <aside className="sidebar"><div className="brand"><div className="brand-mark">A</div><div><strong>alesyan</strong><small>RESERVE</small></div></div>
  <div className="demo-label"><ShieldCheck size={14} style={{verticalAlign:'middle',marginRight:6}}/>SUPABASE · STAFF ACCESS</div>
  <div className="sidebar-section">RESTAURANT</div><nav className="sidebar-nav">{navItems.map(p=><button key={p.id} className={'nav-item '+(view===p.id?'selected':'')} onClick={()=>setView(p.id)}><p.icon size={18}/>{p.label}</button>)}</nav>
  <div className="sidebar-bottom"><a className="nav-item outline" href="/book/alesyan-demo-malahide" target="_blank" rel="noreferrer">Customer demo booking ↗</a><div className="tiny muted">{session.user.email}<p>Role: {role}</p></div><button className="nav-item outline" onClick={()=>api.auth.signOut()}><LogOut size={17}/>Sign out</button></div>
  </aside><main className="main">
   <header className="topbar"><div className="topbar-title"><span className="eyebrow">ALESYAN / {selected?.name.toUpperCase()}</span><h1>{navItems.find(p=>p.id===view)?.label}</h1></div>
   <div className="staff-head-actions"><select aria-label="Select restaurant" value={siteId} onChange={e=>setSiteId(e.target.value)}>{sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="button outline" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button></div></header>
   <div className="content">
    {feedback&&<Notice text={feedback} onClose={()=>setFeedback('')}/>}
    <div className="staff-disclaimer">STAFF DEVELOPMENT BUILD · Not approved for live restaurant operations. No real customer information until GDPR and deployment checks are complete.</div>
    {loading&&<div className="loading-inline">Refreshing data…</div>}
    {view==='overview'&&<><div className="section-head"><div><h2>Service overview</h2><p className="muted">Real database records for your selected location</p></div><input type="date" className="date-control" value={day} onChange={e=>setDay(e.target.value)}/></div>
      <div className="metrics">
        {[['Active bookings',active.length,CalendarDays],['Expected covers',covers,Users],['Seated',reservations.filter(r=>r.status==='seated').length,LayoutGrid],['Cancelled / no-shows',reservations.filter(r=>!noncancelled(r)).length,AlertCircle]].map(([label,num,Icon],i)=><div className="metric" key={i}><span className="metric-icon">{typeof Icon!=='number'&&typeof Icon!=='string'&&<Icon size={18}/>}</span><div><span className="muted tiny">{label as string}</span><strong>{num as number}</strong></div></div>)}
      </div><section className="panel"><div className="panel-head"><h3>{day} · Booking diary</h3><button className="button primary" onClick={()=>{setView('diary');setEditor(makeEditor(day));}}><Plus size={16}/>Add booking</button></div>
      <div className="diary-list">{reservations.slice(0,15).map(r=><article className="booking-row" key={r.id}><span className="booking-time">{clockFromIso(r.starts_at)}</span><div className="booking-main"><strong>{guestName(r.guest_id)}</strong><div className="muted tiny">{r.party_size} guests · {tableNameFor(r.dining_table_id)}</div></div><span className={'badge status-'+r.status}>{r.status}</span></article>)}</div>{!reservations.length&&<div className="empty">No bookings found for this date.</div>}</section></>}
    {view==='diary'&&<><div className="section-head"><div><h2>Reservations</h2><p className="muted">Double-bookings prevented by the database</p></div><button className="button primary" onClick={()=>setEditor(makeEditor(day))}><Plus size={17}/>New reservation</button></div>
      <div className="filters"><Label title="Service date"><input type="date" value={day} onChange={e=>setDay(e.target.value)}/></Label><Label title="Search"><input placeholder="Guest, source or table" value={query} onChange={e=>setQuery(e.target.value)}/></Label><Label title="Status"><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option>{stat.map(v=><option value={v} key={v}>{v}</option>)}</select></Label></div>
      <section className="panel"><div className="panel-head"><h3>{list.length} bookings</h3><span className="muted tiny">{day}</span></div>
      {list.map(r=><article className="booking-row" key={r.id}><div className="booking-time">{clockFromIso(r.starts_at)}<small>{tableNameFor(r.dining_table_id)}</small></div>
        <div className="booking-main"><strong>{guestName(r.guest_id)}</strong><div className="muted tiny">{r.party_size} guests · {r.source}{r.notes?' · '+r.notes:''}</div></div><span className={'badge status-'+r.status}>{r.status}</span>
        <div className="row-actions"><button className="button ghost compact" disabled={busy} onClick={()=>editReservation(r)}>Edit</button><select aria-label={'Status for '+guestName(r.guest_id)} value={r.status} disabled={busy} onChange={e=>void setStatus(r.id,e.target.value)}>{stat.map(v=><option key={v} value={v}>{v}</option>)}</select></div>
      </article>)}{!list.length&&<div className="empty">No matching bookings.</div>}</section></>}
    {view==='floor'&&<><div className="section-head"><div><h2>Restaurant tables</h2><p className="muted">Manager-controlled capacity and availability</p></div><span className="soft-tag">{tables.filter(t=>t.active).reduce((n,t)=>n+t.capacity,0)} seats</span></div>
      {areas.map(area=><section className="panel" key={area.id}><div className="panel-head"><h3>{area.name}</h3></div><div className="floor-grid">{tables.filter(t=>t.area_id===area.id).map(t=><div className={'floor-table '+(!t.active?'disabled':'')} key={t.id}><strong>{t.label}</strong><span>{t.capacity} seats</span>{isManager(role)&&<><label className="tiny"><input type="checkbox" checked={Boolean((t as DbTable & {movable?:boolean}).movable)} disabled={busy} onChange={e=>void saveRules(t,e.target.checked,Boolean((t as DbTable & {auto_large_booking_enabled?:boolean}).auto_large_booking_enabled))}/> Movable table</label><label className="tiny"><input type="checkbox" checked={(t as DbTable & {auto_large_booking_enabled?:boolean}).auto_large_booking_enabled!==false} disabled={busy} onChange={e=>void saveRules(t,Boolean((t as DbTable & {movable?:boolean}).movable),e.target.checked)}/> Allow automatic large bookings</label></>}<button className="table-toggle" disabled={busy||!isManager(role)} onClick={()=>void toggleTable(t)}>{t.active?'Set out of service':'Restore table'}</button></div>)}</div></section>)}
      {isManager(role)&&<section className="panel"><div className="panel-head"><h3>Join movable tables</h3></div><p className="muted">Only approved pairs in the same dining area can be automatically joined. Both must be movable and allow large bookings.</p><form className="add-table" onSubmit={savePair}><Label title="First table"><select required value={pairA} onChange={e=>setPairA(e.target.value)}><option value="">Choose table</option>{tables.filter(t=>(t as DbTable & {movable?:boolean}).movable).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></Label><Label title="Second table"><select required value={pairB} onChange={e=>setPairB(e.target.value)}><option value="">Choose table</option>{tables.filter(t=>(t as DbTable & {movable?:boolean}).movable&&t.id!==pairA).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></Label><button className="button primary" disabled={busy||!pairA||!pairB}>Enable pair</button></form>{pairs.filter(p=>p.enabled).map(p=><p key={p.id}>{tables.find(t=>t.id===p.table_a)?.label} + {tables.find(t=>t.id===p.table_b)?.label} <button className="button ghost compact" onClick={()=>void disablePair(p.table_a,p.table_b)}>Disable pair</button></p>)}</section>}
      {isManager(role)&&<section className="panel"><div className="panel-head"><h3>Add a table</h3></div><form className="add-table" onSubmit={saveTable}><Label title="Table label"><input value={tableName} onChange={e=>setTableName(e.target.value)} required maxLength={20}/></Label><Label title="Seats"><input type="number" min="1" max="30" value={tableCapacity} onChange={e=>setTableCapacity(Number(e.target.value))}/></Label><Label title="Area"><input value={tableArea} onChange={e=>setTableArea(e.target.value)} required maxLength={60}/></Label><button disabled={busy} className="button primary">Add table</button></form></section>}</>}
    {view==='guests'&&<><div className="section-head"><div><h2>Guest directory</h2><p className="muted">Only guests attached to bookings for {day} are shown</p></div></div><div className="guest-grid">{guests.map(g=><div className="guest-card" key={g.id}><div className="avatar">{g.full_name[0]}</div><div><strong>{g.full_name}</strong><p className="muted tiny">{reservations.filter(r=>r.guest_id===g.id).length} selected-day booking(s)</p></div></div>)}</div>{!guests.length&&<div className="empty">No guest records for this day.</div>}</>}
    {view==='settings'&&<><div className="section-head"><div><h2>Service settings</h2><p className="muted">Only owners and managers can change these values</p></div></div>{draftSettings?<section className="panel"><form onSubmit={saveSettings}><div className="panel-head"><h3>Availability rules</h3><button className="button primary" disabled={busy||!isManager(role)}>Save changes</button></div><div className="form-grid staff-settings">
      {([['lunch_from','Lunch start'],['lunch_to','Lunch end'],['dinner_from','Dinner start'],['dinner_to','Dinner end']] as const).map(([key,title])=><Label key={key} title={title}><input type="time" disabled={!isManager(role)} value={draftSettings[key].slice(0,5)} onChange={e=>setDraftSettings({...draftSettings,[key]:e.target.value})}/></Label>)}
      {([['small_duration_mins','Duration up to 4 guests (min)'],['large_duration_mins','Duration 5+ guests (min)'],['turnover_buffer_mins','Turnover buffer (min)'],['max_party_size','Maximum party size'],['max_advance_days','Days bookable ahead']] as const).map(([key,title])=><Label key={key} title={title}><input type="number" disabled={!isManager(role)} min="0" max="365" value={draftSettings[key]} onChange={e=>setDraftSettings({...draftSettings,[key]:Number(e.target.value)})}/></Label>)}</div></form></section>:<p>Site settings have not been provisioned.</p>}
      <section className="panel"><div className="panel-head"><h3>Security boundaries</h3></div><p className="muted">The authenticated database enforces site membership, role-restricted settings and atomic table overlap checks. Public bookings, outbound messages and payments are not enabled. This is a development build.</p></section></>}
   </div>
  </main><nav className="mobile-nav">{navItems.map(p=><button key={p.id} className={view===p.id?'active':''} onClick={()=>setView(p.id)}><p.icon size={19}/><span>{p.label.split(' ')[0]}</span></button>)}</nav>
  {editor&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditor(null);}}><section className="dialog" role="dialog" aria-modal="true" aria-label="Edit reservation">
    <div className="dialog-head"><div><span className="eyebrow">SECURE STAFF RESERVATION</span><h2>{editor.id?'Edit booking':'New booking'}</h2></div><button className="icon-button" aria-label="Close" onClick={()=>setEditor(null)}><X size={20}/></button></div>
    <form className="form-grid" onSubmit={saveReservation}>
      <Label title="First name"><input value={editor.firstName} maxLength={80} onChange={e=>setEditor({...editor,firstName:e.target.value})}/></Label>
      <Label title="Last name (required)"><input value={editor.lastName} maxLength={80} required onChange={e=>setEditor({...editor,lastName:e.target.value})}/></Label>
      <Label title="Phone number (required)"><input value={editor.phone} type="tel" minLength={7} maxLength={30} required onChange={e=>setEditor({...editor,phone:e.target.value})}/></Label>
      <Label title="Email address"><input value={editor.email} type="email" maxLength={254} onChange={e=>setEditor({...editor,email:e.target.value})}/></Label>
      <Label title="Party size"><input type="number" min="1" max={settings?.max_party_size??8} required value={editor.party} onChange={e=>setEditor({...editor,party:Number(e.target.value)})}/></Label>
      <Label title="Date"><input type="date" required value={editor.date} min={todayDublin()} onChange={e=>setEditor({...editor,date:e.target.value})}/></Label>
      <Label title="Time"><input type="time" step="1800" required value={editor.time} onChange={e=>setEditor({...editor,time:e.target.value})}/></Label>
      <Label title="Source"><select value={editor.source} onChange={e=>setEditor({...editor,source:e.target.value})}>{sources.map(s=><option key={s}>{s}</option>)}</select></Label>
      <Label title="Table"><select value={editor.preferredTableId} onChange={e=>setEditor({...editor,preferredTableId:e.target.value})}><option value="">Automatic allocation</option>{tables.filter(t=>t.active).map(t=><option key={t.id} value={t.id}>{t.label} · {t.capacity} seats</option>)}</select></Label>
      <div className="full"><Label title="Internal notes"><textarea value={editor.notes} maxLength={500} rows={3} onChange={e=>setEditor({...editor,notes:e.target.value})}/></Label></div>
      <div className="full muted tiny">Availability and table conflicts are checked again atomically in the database when saved.</div>
      <div className="full dialog-actions"><button type="button" className="button ghost" onClick={()=>setEditor(null)}><ArrowLeft size={15}/>Cancel</button><button className="button primary" type="submit" disabled={busy}>{busy?'Saving…':'Save reservation'}</button></div>
    </form>
  </section></div>}
 </div>;
}
