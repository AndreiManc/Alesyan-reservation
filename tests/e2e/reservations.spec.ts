import { test, expect, type Page } from '@playwright/test';

const backend = 'https://fake-reservations.supabase.co';
const userId='00000000-0000-4000-8000-000000000011';
const siteId='00000000-0000-4000-8000-000000000022';
const areaId='00000000-0000-4000-8000-000000000033';
const tableId='00000000-0000-4000-8000-000000000044';
const guestId='00000000-0000-4000-8000-000000000055';
const bookingId='00000000-0000-4000-8000-000000000066';
const expires=Math.floor(Date.now()/1000)+86400;
const encoded=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt=encoded({alg:'HS256',typ:'JWT'})+'.'+encoded({sub:userId,exp:expires,aud:'authenticated',role:'authenticated'})+'.ci';
const session={
  access_token:jwt,refresh_token:'ci-fake-refresh',expires_at:expires,expires_in:86400,token_type:'bearer',
  user:{id:userId,aud:'authenticated',role:'authenticated',email:'fictional-owner@example.test',
    app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()}
};

function arrival():string {
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return date+'T12:00:00Z';
}
function departure():string {
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Dublin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return date+'T14:00:00Z';
}
async function mockedOwner(page:Page) {
 await page.addInitScript((init)=>{
    localStorage.setItem('sb-fake-reservations-auth-token',JSON.stringify(init));
 },session);
 await page.route(backend+'/**',async route=>{
   const url=new URL(route.request().url());
   const path=url.pathname;
   const answer=(data:unknown)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','content-range':'0-0/1'},body:JSON.stringify(data)});
   if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}});
   if(path==='/auth/v1/user')return answer(session.user);
   if(path.endsWith('/site_memberships'))return answer([{site_id:siteId,role:'owner'}]);
   if(path.endsWith('/sites'))return answer([{id:siteId,name:'Fictional Malahide',timezone:'Europe/Dublin'}]);
   if(path.endsWith('/site_settings'))return answer({site_id:siteId,lunch_from:'11:30:00',lunch_to:'14:30:00',dinner_from:'17:00:00',dinner_to:'20:30:00',small_duration_mins:90,large_duration_mins:120,turnover_buffer_mins:15,max_party_size:8,max_advance_days:45});
   if(path.endsWith('/dining_tables'))return answer([{id:tableId,site_id:siteId,area_id:areaId,label:'T1',capacity:4,active:true,shape:'square',x:20,y:20}]);
   if(path.endsWith('/dining_areas'))return answer([{id:areaId,site_id:siteId,name:'Main Dining'}]);
   if(path.endsWith('/reservations'))return answer([{id:bookingId,site_id:siteId,guest_id:guestId,dining_table_id:tableId,party_size:2,starts_at:arrival(),ends_at:departure(),status:'confirmed',source:'Phone',notes:'CI invented guest',created_at:new Date().toISOString()}]);
   if(path.endsWith('/guests'))return answer([{id:guestId,site_id:siteId,full_name:'Fictional Guest',phone:null,email:null}]);
   if(path.includes('/rpc/staff_save_reservation_v2'))return answer('00000000-0000-4000-8000-000000000088');
   if(path.includes('/rpc/staff_change_reservation_status'))return answer(null);
   if(path.includes('/rpc/staff_upsert_table'))return answer('00000000-0000-4000-8000-000000000099');
   if(path.includes('/rpc/staff_update_settings'))return answer(null);
   return route.fulfill({status:404,body:JSON.stringify({message:'Unmocked '+path})});
 });
}
function nav(page:Page, desktopName:string, mobileName:string) {
 return page.getByRole('button',{name:page.viewportSize()!.width<760?mobileName:desktopName,exact:true});
}

test('public route requires login and reveals no guests',async ({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Staff sign in'})).toBeVisible();
 await expect(page.getByText('Fictional Guest')).toHaveCount(0);
 await page.getByRole('button',{name:'Create a test staff account'}).click();
 await expect(page.getByRole('heading',{name:'Create test staff account'})).toBeVisible();
 await expect(page.getByLabel('Work email')).toBeVisible();
 await expect(page.getByLabel('Password')).toBeVisible();
 expect(errors).toEqual([]);
});

test('owner sees diary and booking editor with synthetic API',async ({page})=>{
 await mockedOwner(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await expect(page.getByText('Fictional Guest')).toBeVisible();
 await nav(page,'Reservation diary','Reservation').click();
 await expect(page.getByRole('heading',{name:'Reservation diary'})).toBeVisible();
 await expect(page.getByText('Fictional Guest')).toBeVisible();
 await page.getByRole('button',{name:'New reservation'}).click();
 await expect(page.getByRole('dialog',{name:'Edit reservation'})).toBeVisible();
 await expect(page.getByText(/Availability and table conflicts are checked again atomically/)).toBeVisible();
 expect(errors).toEqual([]);
});

test('owner can access table management and settings',async ({page})=>{
 await mockedOwner(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await nav(page,'Floor & tables','Floor').click();
 await expect(page.getByRole('heading',{name:'Restaurant tables'})).toBeVisible();
 await expect(page.getByText('T1')).toBeVisible();
 await nav(page,'Settings','Settings').click();
 await expect(page.getByRole('heading',{name:'Service settings'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Save changes'})).toBeEnabled();
 expect(errors).toEqual([]);
});

test('actual deployed site shows a login, not private reservation data',async ({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://alesyan-reservations.onrender.com',{waitUntil:'domcontentloaded',timeout:30000});
 await expect(page.getByRole('heading',{name:'Staff sign in'})).toBeVisible();
 await expect(page.getByText('Fictional Guest')).toHaveCount(0);
 expect(errors).toEqual([]);
});


test('authenticated owner can submit a new reservation through the staff RPC',async ({page})=>{
 await mockedOwner(page);
 const writes:Array<{url:string;body:Record<string,unknown>}>=[];
 page.on('request',req=>{
  if(req.url().includes('/rpc/staff_save_reservation_v2') && req.method()==='POST') {
   writes.push({url:req.url(),body:JSON.parse(req.postData()||'{}')});
  }
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await nav(page,'Reservation diary','Reservation').click();
 await page.getByRole('button',{name:'New reservation'}).click();
 const dialog=page.getByRole('dialog',{name:'Edit reservation'});
 await dialog.getByLabel('First name').fill('Playwright Fictional');
 await dialog.getByLabel('Last name (required)').fill('Customer');
 await dialog.getByLabel('Phone number (required)').fill('0870000000');
 await dialog.getByLabel('Party size').fill('3');
 await dialog.getByLabel('Internal notes').fill('Browser CI synthetic data only');
 await dialog.getByRole('button',{name:'Save reservation'}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByText('Reservation saved securely.')).toBeVisible();
 expect(writes).toHaveLength(1);
 expect(writes[0].body.p_first_name).toBe('Playwright Fictional');
 expect(writes[0].body.p_last_name).toBe('Customer');
 expect(writes[0].body.p_phone).toBe('0870000000');
 expect(writes[0].body.p_party).toBe(3);
 expect(writes[0].body.p_source).toBe('Phone');
 expect(writes[0].body.p_site_id).toBe(siteId);
 expect(typeof writes[0].body.p_request_id).toBe('string');
});

test('authenticated owner changes reservation status through authorised RPC',async ({page})=>{
 await mockedOwner(page);
 const writes:Record<string,unknown>[]=[];
 page.on('request',req=>{
  if(req.url().includes('/rpc/staff_change_reservation_status') && req.method()==='POST')
   writes.push(JSON.parse(req.postData()||'{}'));
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await nav(page,'Reservation diary','Reservation').click();
 await page.getByRole('combobox',{name:'Status for Fictional Guest'}).selectOption('seated');
 await expect(page.getByText('Status updated and recorded in the audit history.')).toBeVisible();
 expect(writes).toEqual([{p_reservation_id:bookingId,p_status:'seated'}]);
});

test('owner can create table via role-gated staff RPC',async ({page})=>{
 await mockedOwner(page);
 const writes:Record<string,unknown>[]=[];
 page.on('request',req=>{
  if(req.url().includes('/rpc/staff_upsert_table') && req.method()==='POST')
   writes.push(JSON.parse(req.postData()||'{}'));
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await nav(page,'Floor & tables','Floor').click();
 await page.getByLabel('Table label').fill('T9');
 await page.getByLabel('Seats').fill('6');
 await page.getByLabel('Area').fill('Main Dining');
 await page.getByRole('button',{name:'Add table'}).click();
 await expect(page.getByText('Table created.')).toBeVisible();
 expect(writes).toHaveLength(1);
 expect(writes[0].p_label).toBe('T9');
 expect(writes[0].p_capacity).toBe(6);
 expect(writes[0].p_site_id).toBe(siteId);
});

test('owner can change service settings through authenticated RPC',async ({page})=>{
 await mockedOwner(page);
 const writes:Record<string,unknown>[]=[];
 page.on('request',req=>{
  if(req.url().includes('/rpc/staff_update_settings') && req.method()==='POST')
   writes.push(JSON.parse(req.postData()||'{}'));
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await nav(page,'Settings','Settings').click();
 await page.getByLabel('Maximum party size').fill('10');
 await page.getByRole('button',{name:'Save changes'}).click();
 await expect(page.getByText('Service settings updated.')).toBeVisible();
 expect(writes).toHaveLength(1);
 expect(writes[0].p_max_party).toBe(10);
 expect(writes[0].p_site_id).toBe(siteId);
});


test('public customer demo offers slots and creates a booking through secure edge function',async ({page})=>{
 const edge=backend+'/functions/v1/public-demo-booking';
 const calls:Array<Record<string,unknown>>=[];
 await page.route(edge,async route=>{
   const input=JSON.parse(route.request().postData()||'{}') as Record<string,unknown>;
   calls.push(input);
   const body=input.action==='slots'?{slots:['17:00','18:00','19:00']}:{reference:'DEMO123456'};
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 });
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/book/alesyan-demo-malahide');
 await expect(page.getByRole('heading',{name:'Alesyan Demo — Malahide'})).toBeVisible();
 await expect(page.getByText(/DEMONSTRATION ONLY/)).toBeVisible();
 await expect(page.getByText('18:00')).toBeVisible();
 await page.getByRole('button',{name:'18:00'}).click();
 await page.getByLabel('Last name (required)').fill('Test');
 await page.getByLabel('Phone number (required)').fill('0870000000');
 await page.getByRole('button',{name:'Confirm fictional booking'}).click();
 await expect(page.getByRole('heading',{name:'Test reservation confirmed'})).toBeVisible();
 await expect(page.getByText(/DEMO123456/)).toBeVisible();
 const saved=calls.find(c=>c.action==='book');
 expect(saved?.slug).toBe('alesyan-demo-malahide');
 expect(saved?.time).toBe('18:00');
 expect(saved?.party).toBe(2);
 expect(saved?.requestId).toMatch(/^[0-9a-f-]{36}$/i);
 expect(saved).not.toHaveProperty('guestName');
 expect(errors).toEqual([]);
});

test('customer test page shows API errors without falsely confirming booking',async ({page})=>{
 await page.route(backend+'/functions/v1/public-demo-booking',async route=>{
  const request=JSON.parse(route.request().postData()||'{}') as Record<string,unknown>;
  await route.fulfill({status:request.action==='book'?400:200,contentType:'application/json',
   body:JSON.stringify(request.action==='book'?{error:'This slot just became unavailable'}:{slots:['18:00']})});
 });
 await page.goto('/book/alesyan-demo-malahide');
 await page.getByRole('button',{name:'18:00'}).click();
 await page.getByLabel('Last name (required)').fill('Test');
 await page.getByLabel('Phone number (required)').fill('0870000000');
 await page.getByRole('button',{name:'Confirm fictional booking'}).click();
 await expect(page.getByRole('alert')).toContainText('This slot just became unavailable');
 await expect(page.getByRole('heading',{name:'Test reservation confirmed'})).toHaveCount(0);
});
