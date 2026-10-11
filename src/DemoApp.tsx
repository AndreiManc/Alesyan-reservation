import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, ClipboardList, LayoutGrid, Users, Settings2, Plus, Search, ArrowLeft, RotateCcw, ExternalLink, CheckCircle2, Clock3, CalendarCheck2, UserRoundCheck, AlertCircle } from 'lucide-react';
import { availableTable, dateAfter, loadDemo, saveDemo, seedDemo, slots, todayDublin, withinService } from './domain';
import type { Booking, DemoData, Source, Status, Settings as VenueSettings } from './domain';

type Page = 'overview' | 'diary' | 'floor' | 'guests' | 'settings' | 'book';
type BookingInput = Omit<Booking, 'id' | 'createdAt' | 'tableId'>;
const pages: Array<{ id: Page; name: string; icon: typeof CalendarDays }> = [
  { id:'overview',name:'Overview',icon:LayoutGrid },
  { id:'diary',name:'Reservation diary',icon:ClipboardList },
  { id:'floor',name:'Floor & tables',icon:LayoutGrid },
  { id:'guests',name:'Guests',icon:Users },
  { id:'settings',name:'Settings',icon:Settings2 },
];
const sourceOptions: Source[] = ['Phone','Walk-in','Website','Other','OpenTable (historic)'];
const statuses: Status[] = ['confirmed','seated','completed','no-show','cancelled'];
function newInput(date: string): BookingInput {
  return { guest:'',phone:'',email:'',date,time:'18:00',party:2,status:'confirmed',source:'Phone',notes:'' };
}
const statusText = (s: Status): string => s==='no-show' ? 'No-show' : s.charAt(0).toUpperCase() + s.slice(1);
function Badge({ status }: { status: Status }) { return <span className={'badge status-'+status}>{statusText(status)}</span>; }
function Metric({ label, value, icon: Icon, help }: {label:string;value:number;icon:typeof CalendarDays;help:string}) {
  return <div className="metric"><span className="metric-icon"><Icon size={18}/></span><div><span className="muted tiny">{label}</span><strong>{value}</strong><small>{help}</small></div></div>;
}
function Field({label,children}: {label:string;children:React.ReactNode}) { return <label className="field"><span>{label}</span>{children}</label>; }
function BookingForm({initial, onClose, onSave, maxParty}: {initial:BookingInput;onClose:()=>void;onSave:(v:BookingInput)=>string|null;maxParty:number}) {
  const [form,setForm] = useState<BookingInput>(initial);
  const [error,setError] = useState('');
  function submit(e:FormEvent) {e.preventDefault(); const result=onSave(form); if(result) setError(result); else onClose();}
  return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget) onClose();}}>
    <section className="dialog" role="dialog" aria-modal="true" aria-label="Reservation editor">
      <div className="dialog-head"><div><span className="eyebrow">STAFF DEMO</span><h2>Reservation details</h2></div><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>
      <form onSubmit={submit} className="form-grid">
        <Field label="Guest name"><input required maxLength={80} value={form.guest} onChange={e=>setForm({...form,guest:e.target.value})} placeholder="Invented name only" /></Field>
        <Field label="Party size"><input type="number" min="1" max={maxParty} required value={form.party} onChange={e=>setForm({...form,party:Number(e.target.value)})} /></Field>
        <Field label="Date"><input type="date" required value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Field>
        <Field label="Arrival"><input type="time" step="1800" required value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></Field>
        <Field label="Source"><select value={form.source} onChange={e=>setForm({...form,source:e.target.value as Source})}>{sourceOptions.map(s=><option key={s}>{s}</option>)}</select></Field>
        <Field label="Status"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value as Status})}>{statuses.map(s=><option key={s} value={s}>{statusText(s)}</option>)}</select></Field>
        <div className="full"><Field label="Notes"><textarea rows={2} maxLength={400} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Test notes (no personal information)"/></Field></div>
        {error && <p className="error full"><AlertCircle size={16}/>{error}</p>}
        <div className="full dialog-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Save booking</button></div>
      </form>
    </section>
  </div>;
}
export default function App() {
  const [data,setData] = useState<DemoData>(loadDemo);
  const [page,setPage] = useState<Page>(() => {
    const hash=window.location.hash.replace('#','');
    return [...pages.map(p=>p.id),'book'].includes(hash as Page) ? hash as Page : 'overview';
  });
  const [day,setDay] = useState(todayDublin());
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('all');
  const [editing,setEditing] = useState<{id?:string;value:BookingInput}|null>(null);
  const [feedback,setFeedback] = useState('');
  const [bookDate,setBookDate] = useState(todayDublin());
  const [bookParty,setBookParty] = useState(2);
  const [bookTime,setBookTime] = useState('');
  const [bookGuest,setBookGuest] = useState('');
  const [bookNotes,setBookNotes] = useState('');
  const [bookRef,setBookRef] = useState('');
  const [newTableName,setNewTableName] = useState('');
  const [newCapacity,setNewCapacity] = useState(2);
  const [newArea,setNewArea] = useState('Main Dining');
  const {bookings,tables,settings} = data;
  useEffect(()=>saveDemo(data),[data]);
  useEffect(()=>{const fn=()=>{
    const hash=window.location.hash.replace('#','') as Page;
    setPage([...pages.map(p=>p.id),'book'].includes(hash)?hash:'overview');
  };window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn);},[]);
  function go(p:Page){window.location.hash=p;setPage(p);setFeedback('');}
  const dated=useMemo(()=>bookings.filter(b=>b.date===day).sort((a,b)=>a.time.localeCompare(b.time)),[bookings,day]);
  const confirmed=dated.filter(b=>b.status!=='cancelled' && b.status!=='no-show');
  const activeCovers=confirmed.reduce((sum,b)=>sum+b.party,0);
  const seated=dated.filter(b=>b.status==='seated').length;
  const list=dated.filter(b=>(filter==='all'||b.status===filter) && (b.guest+' '+b.source+' '+b.notes).toLowerCase().includes(search.toLowerCase()));
  const availableTimes=useMemo(()=>slots(bookings,tables,bookDate,bookParty,settings),[bookings,tables,bookDate,bookParty,settings]);
  function saveBooking(input:BookingInput, id?:string):string|null {
    if(!input.guest.trim() || input.guest.trim().length>80) return 'Enter a guest name (max 80 characters).';
    if(!Number.isInteger(input.party)||input.party<1||input.party>settings.maxParty) return 'Invalid party size.';
    if(!withinService(input.time,settings)) return 'Choose a time within configured lunch or dinner service.';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return 'Choose a valid date.';
    const table=availableTable(bookings,tables,input.date,input.time,input.party,settings,id);
    if(!table && input.status!=='cancelled' && input.status!=='no-show') return 'No suitable table available at that time. Try another slot.';
    const old=bookings.find(b=>b.id===id);
    const row:Booking={...input,id:id??crypto.randomUUID(),createdAt:old?.createdAt??new Date().toISOString(),tableId:table?.id??old?.tableId??''};
    setData(prev=>({...prev,bookings:id?prev.bookings.map(b=>b.id===id?row:b):[...prev.bookings,row]}));
    setFeedback('Demo reservation saved in this browser.');
    return null;
  }
  function updateStatus(id:string,status:Status) {
    setData(prev=>({...prev,bookings:prev.bookings.map(b=>b.id===id?{...b,status}:b)}));
    setFeedback('Reservation status updated.');
  }
  function editRow(row:Booking){const {id,createdAt,tableId,...value}=row;void createdAt;void tableId;setEditing({id,value});}
  function resetDemo(){if(window.confirm('Restore the fictional sample bookings and settings in this browser?')){setData(seedDemo());setDay(todayDublin());setFeedback('Demo data restored.');}}
  function confirmGuest(e:FormEvent){
    e.preventDefault();
    if(bookDate<todayDublin() || bookDate>dateAfter(todayDublin(),settings.maxAdvanceDays)){setFeedback('Choose a date within the reservation window.');return;}
    if(!bookTime || !availableTimes.includes(bookTime)){setFeedback('Select a time that is still available.');return;}
    if(!bookGuest.trim()){setFeedback('Enter a fictional test name.');return;}
    const error=saveBooking({guest:bookGuest.trim(),phone:'',email:'',date:bookDate,time:bookTime,party:bookParty,source:'Website',status:'confirmed',notes:bookNotes});
    if(error){setFeedback(error);return;}
    setBookRef('DEMO-'+Math.random().toString(36).slice(2,8).toUpperCase());setFeedback('');setBookTime('');
  }
  const tableLabel=(id:string)=>tables.find(t=>t.id===id)?.name??'—';
  const title=page==='book'?'Customer booking demo':pages.find(p=>p.id===page)?.name??'Overview';
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">A</div><div><strong>alesyan</strong><small>RESERVE</small></div></div>
      <div className="demo-label">DEMO MODE · No real reservations</div>
      <div className="sidebar-section">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">{pages.map(({id,name,icon:Icon})=><button key={id} className={'nav-item '+(page===id?'selected':'')} onClick={()=>go(id)}><Icon size={18}/>{name}</button>)}</nav>
      <div className="sidebar-bottom"><button className="nav-item outline" onClick={()=>go('book')}><ExternalLink size={18}/>Public booking demo</button><span className="tiny muted">Alesyan Reserve · Prototype v0.1</span></div>
    </aside>
    <main className="main">
      <div className="topbar"><div className="topbar-title"><span className="eyebrow">ALESYAN / {settings.venue.toUpperCase()}</span><h1>{title}</h1></div><div className="topbar-right"><span className="pill-online">● Demo environment</span><button className="button outline top-book" onClick={()=>go('book')}><ExternalLink size={16}/>Guest preview</button></div></div>
      <div className="content">
        {page==='book' && <section className="booking-public">
          <button className="back" onClick={()=>go('overview')}><ArrowLeft size={17}/>Back to staff demo</button>
          <div className="booking-cover"><span className="eyebrow light">ALESYAN RESERVATIONS</span><h2>{settings.venue}</h2><p>Reserve your table</p></div>
          <div className="warning">This is a demonstration. It does not create real restaurant reservations. Use invented names only; do not enter personal information.</div>
          {bookRef ? <div className="book-card success-card"><CheckCircle2 size={35}/><h2>Demo reservation created</h2><p>Reference: <strong>{bookRef}</strong></p><p>This booking exists only in this browser. No email or SMS has been sent.</p><button className="button primary" onClick={()=>{setBookRef('');setBookGuest('');setBookNotes('');}}>Make another demo booking</button></div>:
          <form className="book-card" onSubmit={confirmGuest}>
            <h2>Find a table</h2><div className="form-grid">
              <Field label="Date"><input type="date" required min={todayDublin()} max={dateAfter(todayDublin(),settings.maxAdvanceDays)} value={bookDate} onChange={e=>{setBookDate(e.target.value);setBookTime('');}}/></Field>
              <Field label="Guests"><select value={bookParty} onChange={e=>{setBookParty(Number(e.target.value));setBookTime('');}}>{Array.from({length:settings.maxParty},(_,i)=><option key={i} value={i+1}>{i+1} {i===0?'guest':'guests'}</option>)}</select></Field>
            </div>
            <h3>Available times</h3><div className="slot-grid">{availableTimes.length?availableTimes.map(time=><button type="button" key={time} className={'slot '+(time===bookTime?'chosen':'')} onClick={()=>setBookTime(time)}>{time}</button>):<p className="muted">No tables available. Try a different date or party size.</p>}</div>
            <hr/><h3>Your test details</h3>
            <Field label="Fictional guest name"><input required value={bookGuest} maxLength={80} onChange={e=>setBookGuest(e.target.value)} placeholder="e.g. Demo Guest"/></Field>
            <Field label="Optional test note"><textarea rows={2} maxLength={400} value={bookNotes} onChange={e=>setBookNotes(e.target.value)} placeholder="For demonstration only"/></Field>
            {feedback&&<p className="error">{feedback}</p>}
            <button disabled={!bookTime} className="button primary wide" type="submit">Confirm demo booking</button>
          </form>}
        </section>}
        {page!=='book' && feedback && <div className="notice" role="status"><CheckCircle2 size={16}/>{feedback}<button onClick={()=>setFeedback('')} aria-label="Dismiss">×</button></div>}
        {page==='overview'&&<><div className="section-head"><div><h2>Service overview</h2><p className="muted">Your restaurant at a glance · synthetic reservations</p></div><input className="date-control" aria-label="Service date" type="date" value={day} onChange={e=>setDay(e.target.value)}/></div>
          <div className="metrics"><Metric label="Reservations" value={confirmed.length} icon={CalendarDays} help="Active bookings"/><Metric label="Expected covers" value={activeCovers} icon={Users} help="Confirmed and served"/><Metric label="Guests seated" value={seated} icon={UserRoundCheck} help="Currently in service"/><Metric label="Cancelled / no-show" value={dated.filter(b=>b.status==='cancelled'||b.status==='no-show').length} icon={Clock3} help="Not counted in covers"/></div>
          <section className="panel"><div className="panel-head"><div><h3>Upcoming reservations</h3><p className="muted tiny">Today's booking diary</p></div><button className="button primary" onClick={()=>setEditing({value:newInput(day)})}><Plus size={16}/>New reservation</button></div>
          <div className="table-wrap"><table><thead><tr><th>Arrival</th><th>Guest</th><th>Party</th><th>Table</th><th>Source</th><th>Status</th></tr></thead><tbody>{dated.map(b=><tr key={b.id}><td className="time-cell">{b.time}</td><td><strong>{b.guest}</strong>{b.notes&&<small>{b.notes}</small>}</td><td>{b.party} guests</td><td>{tableLabel(b.tableId)}</td><td>{b.source}</td><td><Badge status={b.status}/></td></tr>)}</tbody></table>{!dated.length&&<div className="empty">No demo reservations for this date.</div>}</div>
          <button className="text-link" onClick={()=>go('diary')}>Open full reservation diary →</button></section></>}
        {page==='diary'&&<><div className="section-head"><div><h2>Reservation diary</h2><p className="muted">Create, find and manage test bookings</p></div><button className="button primary" onClick={()=>setEditing({value:newInput(day)})}><Plus size={17}/>Add reservation</button></div>
          <div className="filters"><Field label="Date"><input type="date" value={day} onChange={e=>setDay(e.target.value)}/></Field><Field label="Search"><span className="search-wrap"><Search size={16}/><input placeholder="Guest, note or source" value={search} onChange={e=>setSearch(e.target.value)}/></span></Field><Field label="Status"><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(s=><option key={s} value={s}>{statusText(s)}</option>)}</select></Field></div>
          <section className="panel"><div className="panel-head"><h3>{list.length} reservations</h3><span className="muted tiny">{day}</span></div>
          <div className="diary-list">{list.map(b=><article className="booking-row" key={b.id}><div className="booking-time">{b.time}<small>{tableLabel(b.tableId)}</small></div><div className="booking-main"><strong>{b.guest}</strong><div className="muted tiny">{b.party} guests · {b.source}{b.notes?' · '+b.notes:''}</div></div><Badge status={b.status}/><div className="row-actions"><button className="button ghost compact" onClick={()=>editRow(b)}>Edit</button><select aria-label={'Change status for '+b.guest} value={b.status} onChange={e=>updateStatus(b.id,e.target.value as Status)}>{statuses.map(s=><option key={s} value={s}>{statusText(s)}</option>)}</select></div></article>)}</div>
          {!list.length&&<div className="empty">No matching demo reservations. Add a booking to get started.</div>}</section></>}
        {page==='floor'&&<><div className="section-head"><div><h2>Floor & table management</h2><p className="muted">Edit table capacity and availability in the demo</p></div><span className="soft-tag">{tables.filter(t=>t.active).reduce((n,t)=>n+t.capacity,0)} available seats</span></div>
          {Array.from(new Set(tables.map(t=>t.area))).map(area=><section className="panel floor-panel" key={area}><div className="panel-head"><h3>{area}</h3><span className="muted tiny">{tables.filter(t=>t.area===area).length} tables</span></div><div className="floor-grid">{tables.filter(t=>t.area===area).map(t=><div className={'floor-table '+(!t.active?'disabled':'')} key={t.id}><strong>{t.name}</strong><span>{t.capacity} seats</span><div className="floor-buttons"><button aria-label={'Reduce capacity of '+t.name} disabled={t.capacity<=1} onClick={()=>setData(prev=>({...prev,tables:prev.tables.map(x=>x.id===t.id?{...x,capacity:Math.max(1,x.capacity-1)}:x)}))}>−</button><button aria-label={'Increase capacity of '+t.name} disabled={t.capacity>=20} onClick={()=>setData(prev=>({...prev,tables:prev.tables.map(x=>x.id===t.id?{...x,capacity:Math.min(20,x.capacity+1)}:x)}))}>+</button></div><button className="table-toggle" onClick={()=>setData(prev=>({...prev,tables:prev.tables.map(x=>x.id===t.id?{...x,active:!x.active}:x)}))}>{t.active?'Set out of service':'Restore table'}</button></div>)}</div></section>)}
          <section className="panel"><div className="panel-head"><h3>Add demo table</h3></div><form className="add-table" onSubmit={e=>{e.preventDefault();if(!newTableName.trim())return;setData(prev=>({...prev,tables:[...prev.tables,{id:crypto.randomUUID(),name:newTableName.trim(),area:newArea,capacity:newCapacity,active:true}]}));setNewTableName('');}}>
          <Field label="Table name"><input required value={newTableName} maxLength={10} onChange={e=>setNewTableName(e.target.value)} placeholder="T9"/></Field><Field label="Area"><select value={newArea} onChange={e=>setNewArea(e.target.value)}><option>Main Dining</option><option>Terrace</option></select></Field><Field label="Capacity"><input type="number" min="1" max="20" value={newCapacity} onChange={e=>setNewCapacity(Number(e.target.value))}/></Field><button className="button primary" type="submit">Add table</button></form>
          <p className="muted tiny">Drag-and-drop visual floor layout and service-time occupancy are planned for the next phase.</p></section></>}
        {page==='guests'&&<><div className="section-head"><div><h2>Guest directory</h2><p className="muted">Sample names only — no production guest records</p></div><span className="soft-tag">{new Set(bookings.map(b=>b.guest.toLowerCase())).size} sample guests</span></div>
          <div className="guest-grid">{Array.from(new Set(bookings.map(b=>b.guest))).sort().map(name=>{const visits=bookings.filter(b=>b.guest===name && b.status!=='cancelled');return <div className="guest-card" key={name}><div className="avatar">{name.charAt(0)}</div><div><strong>{name}</strong><p className="muted tiny">{visits.length} sample reservation{visits.length===1?'':'s'} · last {visits.map(v=>v.date).sort().reverse()[0]??'—'}</p></div></div>;})}</div></>}
        {page==='settings'&&<><div className="section-head"><div><h2>Restaurant settings</h2><p className="muted">Changes are saved locally in this browser</p></div><button className="button outline" onClick={resetDemo}><RotateCcw size={16}/>Reset demo</button></div>
          <section className="panel settings-panel"><div className="panel-head"><h3>Service configuration</h3></div><div className="form-grid">
          <div className="full"><Field label="Demo restaurant name"><input value={settings.venue} maxLength={80} onChange={e=>setData(prev=>({...prev,settings:{...prev.settings,venue:e.target.value}}))}/></Field></div>
          {(['lunchFrom','lunchTo','dinnerFrom','dinnerTo'] as const).map(key=><Field key={key} label={key.replace('From',' start').replace('To',' end')}><input type="time" step="1800" value={settings[key]} onChange={e=>setData(prev=>({...prev,settings:{...prev.settings,[key]:e.target.value}}))}/></Field>)}
          {(['smallDuration','largeDuration','buffer','maxParty','maxAdvanceDays'] as const).map(key=><Field key={key} label={key==='smallDuration'?'Table duration ≤4 guests (min)':key==='largeDuration'?'Table duration ≥5 guests (min)':key==='buffer'?'Turnover buffer (min)':key==='maxParty'?'Max party size': 'Days bookable ahead'}><input type="number" min={key==='maxParty'?1:0} max={key==='maxParty'?20:365} value={settings[key]} onChange={e=>setData(prev=>({...prev,settings:{...prev.settings,[key]:Math.max(0,Number(e.target.value))}}))}/></Field>)}</div>
          <p className="muted tiny">Opening hours and capacity are demonstration rules, not a production availability engine.</p></section>
          <section className="panel"><div className="panel-head"><h3>Prototype safety</h3></div><p>No user login, backend, SMS, email or online payments are connected. Do not collect actual customer names, phone numbers or dietary/health information here. A separate secured Supabase project and server-side booking logic are prerequisites for any live rollout.</p></section></>}
      </div>
    </main>
    {page!=='book'&&<nav className="mobile-nav" aria-label="Mobile navigation">{pages.slice(0,5).map(({id,name,icon:Icon})=><button key={id} className={page===id?'active':''} onClick={()=>go(id)}><Icon size={19}/><span>{name.split(' ')[0]}</span></button>)}</nav>}
    {editing && <BookingForm initial={editing.value} onClose={()=>setEditing(null)} maxParty={settings.maxParty} onSave={value=>saveBooking(value,editing.id)}/>}
  </div>;
}
