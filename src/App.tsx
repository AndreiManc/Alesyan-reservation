import DemoApp from './DemoApp';
import StaffApp from './StaffApp';
import { isSupabaseConfigured } from './lib/supabase';

// A dedicated Supabase project switches to secure staff mode.
// Without project credentials, the sample-only browser demo remains available.
export default function App() {
  return isSupabaseConfigured ? <StaffApp/> : <DemoApp/>;
}
