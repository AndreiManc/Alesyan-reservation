export type Status = 'confirmed' | 'seated' | 'completed' | 'no-show' | 'cancelled';
export type Source = 'Website' | 'Phone' | 'Walk-in' | 'OpenTable (historic)' | 'Other';
export interface DiningTable { id: string; name: string; area: string; capacity: number; active: boolean }
export interface Booking { id: string; guest: string; phone: string; email: string; date: string; time: string; party: number; tableId: string; status: Status; source: Source; notes: string; createdAt: string }
export interface Settings { venue: string; lunchFrom: string; lunchTo: string; dinnerFrom: string; dinnerTo: string; smallDuration: number; largeDuration: number; buffer: number; maxParty: number; maxAdvanceDays: number }
export interface DemoData { bookings: Booking[]; tables: DiningTable[]; settings: Settings }
export const STORAGE_KEY = 'alesyan-reservations-demo-v1';
export const todayDublin = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const dateAfter = (day: string, offset: number): string => {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
export const toMinutes = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const minutesToTime = (m: number): string => String(Math.floor(m / 60)).padStart(2,'0') + ':' + String(m % 60).padStart(2,'0');
export const isBlocking = (s: Status): boolean => s !== 'cancelled' && s !== 'no-show';
export const getDuration = (party: number, settings: Settings): number => (party > 4 ? settings.largeDuration : settings.smallDuration) + settings.buffer;
export function availableTable(bookings: Booking[], tables: DiningTable[], date: string, time: string, party: number, settings: Settings, ignoreId?: string): DiningTable | null {
  if (!/^\d{2}:\d{2}$/.test(time) || party < 1 || party > settings.maxParty) return null;
  const start = toMinutes(time), end = start + getDuration(party, settings);
  const candidates = tables.filter(t => t.active && t.capacity >= party).sort((a,b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
  return candidates.find(table => !bookings.some(b => b.id !== ignoreId && b.date === date && b.tableId === table.id && isBlocking(b.status) &&
    start < toMinutes(b.time) + getDuration(b.party, settings) && toMinutes(b.time) < end)) ?? null;
}
export function withinService(time: string, settings: Settings): boolean {
  const m = toMinutes(time);
  return (m >= toMinutes(settings.lunchFrom) && m <= toMinutes(settings.lunchTo)) ||
    (m >= toMinutes(settings.dinnerFrom) && m <= toMinutes(settings.dinnerTo));
}
export function slots(bookings: Booking[], tables: DiningTable[], date: string, party: number, settings: Settings): string[] {
  const ranges = [[settings.lunchFrom, settings.lunchTo], [settings.dinnerFrom, settings.dinnerTo]];
  const all = ranges.flatMap(([from, to]) => {
    const times: string[] = [];
    for (let m = toMinutes(from); m <= toMinutes(to); m += 30) {
      const time = minutesToTime(m);
      if (availableTable(bookings, tables, date, time, party, settings)) times.push(time);
    }
    return times;
  });
  return [...new Set(all)];
}
export function seedDemo(): DemoData {
  const date = todayDublin(), now = new Date().toISOString();
  const tables: DiningTable[] = [
    {id:'t1',name:'T1',area:'Main Dining',capacity:2,active:true},
    {id:'t2',name:'T2',area:'Main Dining',capacity:2,active:true},
    {id:'t3',name:'T3',area:'Main Dining',capacity:4,active:true},
    {id:'t4',name:'T4',area:'Main Dining',capacity:4,active:true},
    {id:'t5',name:'T5',area:'Main Dining',capacity:6,active:true},
    {id:'t6',name:'T6',area:'Main Dining',capacity:6,active:true},
    {id:'t7',name:'T7',area:'Terrace',capacity:2,active:true},
    {id:'t8',name:'T8',area:'Terrace',capacity:4,active:true},
  ];
  const settings: Settings = { venue:'Alesyan Demo — Malahide', lunchFrom:'11:30', lunchTo:'14:30', dinnerFrom:'17:00', dinnerTo:'20:30', smallDuration:90, largeDuration:120, buffer:15, maxParty:8, maxAdvanceDays:45 };
  const rows: Array<[string,string,number,string,Source,Status,string]> = [
    ['Alex Murphy','12:00',2,'t1','Website','confirmed','Window requested'],
    ['Sarah Kelly','12:30',4,'t3','Phone','confirmed','Birthday'],
    ['Daniel Byrne','13:00',2,'t2','OpenTable (historic)','seated',''],
    ['Niamh Walsh','17:30',6,'t5','Website','confirmed','Vegetarian guest'],
    ['Jamie Ryan','18:00',4,'t4','Phone','confirmed',''],
    ['Erin Doyle','19:00',2,'t1','Website','confirmed',''],
    ['Eoin OBrien','19:30',4,'t8','Other','cancelled',''],
  ];
  const bookings: Booking[] = rows.map(([guest,time,party,tableId,source,status,notes],i) =>
    ({ id:'sample-'+i, guest,phone:'',email:'',date,time,party,tableId,source,status,notes,createdAt:now }));
  return { bookings, tables, settings };
}
export function loadDemo(): DemoData {
  try { const raw = window.localStorage.getItem(STORAGE_KEY); if (raw) {
    const parsed: DemoData = JSON.parse(raw);
    if (Array.isArray(parsed.bookings) && Array.isArray(parsed.tables) && parsed.settings?.venue) return parsed;
  }} catch { /* private browsing: use memory */ }
  return seedDemo();
}
export function saveDemo(data: DemoData): void { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ephemeral session */ } }
