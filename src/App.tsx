import DemoApp from './DemoApp';
import StaffApp from './StaffApp';
import PublicBooking from './PublicBooking';
import { isSupabaseConfigured } from './lib/supabase';

export default function App() {
  if (window.location.pathname.startsWith('/book/')) return isSupabaseConfigured ? <PublicBooking/> : <DemoApp/>;
  return isSupabaseConfigured ? <StaffApp/> : <DemoApp/>;
}
