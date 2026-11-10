import { createClient } from "@supabase/supabase-js";
import { IS_DEMO } from "./brand";
import { createDemoClient } from "./demoClient";

// The portfolio demo (VITE_DEMO=true) swaps in an in-browser fake with the
// same API, so it never talks to the real database.
export const supabase = IS_DEMO
  ? createDemoClient()
  : createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      {
        auth: {
          storage: window.sessionStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      }
    );
