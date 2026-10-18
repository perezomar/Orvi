/* Orvi settings.
   Leave both values empty to run Orvi without accounts (everything stays on the device).
   To turn on accounts and cloud sync, paste your Supabase values here (see README, Part 7).

   SUPABASE_URL      looks like  https://abcdefghijkl.supabase.co
   SUPABASE_ANON_KEY is the "anon" / "publishable" key. It is designed to be public.
                     NEVER paste the "service_role" or "secret" key here.
   VAPID_PUBLIC_KEY  the public half of the push key pair (README Part 9). Never paste the private key.
*/
window.ORVI_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  VAPID_PUBLIC_KEY: ''     // for phone notifications (README Part 9). The PUBLIC key only.
};
