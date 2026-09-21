import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(URL, KEY, {
  auth: {
    storage: {
      getItem: (key) => {
        const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
        return match ? decodeURIComponent(match[2]) : null;
      },
      setItem: (key, value) => {
        document.cookie = `${key}=${encodeURIComponent(value)}; domain=.zed.com; path=/; max-age=604800; secure; samesite=lax`;
      },
      removeItem: (key) => {
        document.cookie = `${key}=; domain=.zed.com; path=/; max-age=0`;
      },
    },
  },
});