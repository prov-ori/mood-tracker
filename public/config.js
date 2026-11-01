// Только публичные параметры. Никогда не вставляйте service_role или sb_secret_ ключ.
window.MOOD_CONFIG = {
  supabaseUrl: "", // https://YOUR_PROJECT.supabase.co
  allowSignup: false, // Для личного сайта: аккаунт создаётся в Supabase Dashboard
  allowRecovery: false, // Включайте после настройки SMTP
  supabaseKey: ""  // Publishable key (sb_publishable_...) или legacy anon key
};
