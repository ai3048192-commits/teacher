import { createClient } from "@supabase/supabase-js";

// القيم بتتقرا من متغيرات البيئة، مش مكتوبة في الكود.
// لازم تضيفهم في Vercel > Settings > Environment Variables،
// وفي ملف .env محلياً.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // رسالة واضحة بدل "KEY is not defined" الغامضة
  throw new Error(
    "متغيرات Supabase ناقصة. أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في إعدادات المشروع."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
