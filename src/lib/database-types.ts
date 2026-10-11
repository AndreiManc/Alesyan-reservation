export interface Membership {site_id:string;role:'owner'|'manager'|'host'}
export interface Site {id:string;name:string;timezone:string}
export interface DbSettings {
 site_id:string;lunch_from:string;lunch_to:string;dinner_from:string;dinner_to:string;
 small_duration_mins:number;large_duration_mins:number;turnover_buffer_mins:number;
 max_party_size:number;max_advance_days:number;
}
export interface DbTable { id:string;site_id:string;area_id:string;label:string;capacity:number;active:boolean;shape:string;x:number;y:number }
export interface DbArea {id:string;site_id:string;name:string}
export interface DbGuest {id:string;site_id:string;full_name:string;phone:string|null;email:string|null}
export interface DbBooking {
 id:string;site_id:string;guest_id:string;dining_table_id:string;party_size:number;
 starts_at:string;ends_at:string;status:'confirmed'|'seated'|'completed'|'cancelled'|'no-show';
 source:'Phone'|'Website'|'Walk-in'|'OpenTable (historic)'|'Other';notes:string;created_at:string;
}
export const dublinDate=(iso:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
export const dublinClock=(iso:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Dublin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
export function describeError(error:unknown):string {
 return error instanceof Error?error.message:typeof error==='object' && error!==null && 'message' in error ? String(error.message):'Unexpected database error';
}
