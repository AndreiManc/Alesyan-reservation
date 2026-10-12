import { useState } from 'react';
import { CalendarDays, Users, ArrowRight } from 'lucide-react';
import { todayDublin } from './domain';
import './booking-widget.css';

/** Embeddable reservation launcher: never collects personal or payment information. */
export default function BookingWidget(){
 const [date,setDate]=useState(todayDublin());
 const [party,setParty]=useState(2);
 const [time,setTime]=useState('18:00');
 const params=new URLSearchParams({date,party:String(party),time});
 const href='/book/alesyan-demo-malahide?'+params.toString();
 return <main className="alesyan-widget">
  <div className="alesyan-widget-brand"><span className="alesyan-widget-logo">A</span><span>ALESYAN <strong>RESERVE</strong></span></div>
  <h1>Reserve a table</h1>
  <p>Choose your preferred date and time.</p>
  <form onSubmit={e=>{e.preventDefault();window.location.assign(href);}}>
    <label><CalendarDays size={16}/>Date<input aria-label="Widget booking date" type="date" min={todayDublin()} required value={date} onChange={e=>setDate(e.target.value)}/></label>
    <label><Users size={16}/>Guests<select aria-label="Widget party size" value={party} onChange={e=>setParty(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1} {i===0?'guest':'guests'}</option>)}</select></label>
    <label>Time<select aria-label="Widget preferred time" value={time} onChange={e=>setTime(e.target.value)}>{Array.from({length:20},(_,i)=>{const hr=11+Math.floor(i/2),mn=i%2?'30':'00';const value=String(hr).padStart(2,'0')+':'+mn;return <option key={value} value={value}>{value}</option>})}</select></label>
    <button type="submit">Find a table <ArrowRight size={16}/></button>
  </form>
  <small>Fictional demo restaurant only · No real reservations or card collection</small>
 </main>;
}
