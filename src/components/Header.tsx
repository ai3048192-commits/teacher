import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, Bell, BookOpen, GraduationCap, LogIn, LogOut, Menu, Search, User, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

/* ================================================================== */
/*  Types & constants                                                 */
/* ================================================================== */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface HeaderProps {
  onOpenSidebar: () => void;
  /** اختياري: لو مرّرته، بيظهر زرار تسجيل الخروج */
  onSignOut?: () => void;
}

interface CurrentUser {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
}

const SEARCH_PAGES = [
  { id: 1, title: "صفحة الكورسات والدبلومات", type: "صفحة", path: "/courses", icon: <BookOpen size={14} /> },
  { id: 2, title: "الملف الشخصي وإعدادات الحساب", type: "صفحة", path: "/profile", icon: <User size={14} /> },
  { id: 3, title: "الشهادات المعتمدة", type: "صفحة", path: "/certificates", icon: <Award size={14} /> },
];

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

// الاسم بيتاخد من students_profile الأول، وبعدين من profiles، وآخر حاجة من
// البيانات اللي اتكتبت وقت التسجيل نفسه (user_metadata.full_name).
const pickName = (profile: Row | null, base: Row | null, meta: Row | undefined, email?: string) =>
  profile?.name || base?.full_name || meta?.full_name || (email ? email.split("@")[0] : "") || "مستخدم ZED";

const pickRole = (profile: Row | null, base: Row | null) => {
  if (profile?.role) return profile.role;
  return base?.role === "teacher" ? "معلم" : "طالب";
};

/* ================================================================== */
/*  Component                                                         */
/* ================================================================== */

export default function Header({ onOpenSidebar, onSignOut }: HeaderProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  /* ---------- بيانات المستخدم الحالي ---------- */

  const loadUser = useCallback(async (): Promise<string | null> => {
    // الكود القديم كان فيه studentId ثابت = 1، فكل المستخدمين كانوا بيشوفوا
    // نفس الاسم ونفس الصورة في الهيدر.
    const { data: auth } = await supabase.auth.getUser();
    const account = auth.user;
    if (!account) {
      setUser(null);
      setLoading(false);
      return null;
    }

    const [profileRes, baseRes] = await Promise.all([
      supabase.from("students_profile").select("name, role, profile_image_url").eq("user_id", account.id).maybeSingle(),
      supabase.from("profiles").select("full_name, role").eq("id", account.id).maybeSingle(),
    ]);

    const profile = profileRes.data ?? null;
    const base = baseRes.data ?? null;

    setUser({
      id: account.id,
      name: pickName(profile, base, account.user_metadata, account.email ?? undefined),
      role: pickRole(profile, base),
      avatar: profile?.profile_image_url ?? null,
    });
    setLoading(false);
    return account.id;
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const userId = await loadUser();
      if (!active || !userId) return;

      // تحديث فوري للهيدر لما الطالب يعدّل اسمه أو صورته من صفحة الملف الشخصي
      channel = supabase
        .channel(`students_profile_header_${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "students_profile", filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as Row | undefined;
            if (!row) return;
            setUser((prev) =>
              prev
                ? {
                    ...prev,
                    name: row.name || prev.name,
                    role: row.role || prev.role,
                    avatar: row.profile_image_url ?? prev.avatar,
                  }
                : prev
            );
          }
        )
        .subscribe();
    })();

    // لو المستخدم سجّل دخول أو خروج، الهيدر يتحدث من غير إعادة تحميل الصفحة
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void loadUser();
    });

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
      sub.subscription.unsubscribe();
    };
  }, [loadUser]);

  /* ---------- عدد الإشعارات ---------- */

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let active = true;
    // RLS بترجّع إشعارات المستخدم الحالي بس، فمفيش داعي لأي فلتر هنا
    supabase
      .from("my_notifications")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        if (active) setUnread(count ?? 0);
      });
    return () => {
      active = false;
    };
  }, [user]);

  /* ---------- البحث ---------- */

  const filteredResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_PAGES.filter(
      (item) => item.title.toLowerCase().includes(q) || item.type.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setIsSearchOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectResult = (path: string) => {
    navigate(path);
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const initial = user?.name?.trim().charAt(0) || "U";

  return (
    <header
      className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3.5 shadow-xs backdrop-blur-xl transition-all sm:px-8"
      dir="rtl"
    >
      <div className="relative flex max-w-xl flex-1 items-center gap-4" ref={searchRef}>
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="فتح القائمة الجانبية"
          className="shrink-0 rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-slate-600 transition-all hover:bg-blue-50 hover:text-blue-600 lg:hidden"
        >
          <Menu size={20} />
        </button>

        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <div className="rounded-xl bg-blue-600 p-2 text-white shadow-sm shadow-blue-600/30">
            <GraduationCap size={18} />
          </div>
          <span className="text-base font-black tracking-wider text-slate-900">
            منصة{" "}
            <span dir="ltr" className="tracking-[0.3em]">
              ZED
            </span>
          </span>
        </div>

        <div className="relative hidden w-full max-w-md items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 shadow-2xs transition-all focus-within:border-blue-600 focus-within:bg-white hover:border-blue-400 md:flex">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            aria-label="بحث"
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsSearchOpen(false);
              if (e.key === "Enter" && filteredResults.length > 0) handleSelectResult(filteredResults[0].path);
            }}
            placeholder="ابحث عن صفحة، كورس، أو قسم..."
            className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setIsSearchOpen(false);
              }}
              aria-label="مسح البحث"
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}

          {isSearchOpen && searchQuery.trim() !== "" && (
            <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 bg-slate-50 p-2.5 text-[11px] font-bold text-slate-500">
                نتائج البحث عن: {searchQuery}
              </div>
              {filteredResults.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {filteredResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectResult(item.path)}
                        className="flex w-full items-center justify-between p-3 text-right text-xs transition-all hover:bg-blue-50/60"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="rounded-lg bg-blue-100 p-2 text-blue-600">{item.icon}</span>
                          <span>
                            <span className="block font-bold text-slate-800">{item.title}</span>
                            <span dir="ltr" className="block text-[10px] font-semibold text-blue-600">
                              {item.path}
                            </span>
                          </span>
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {item.type}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-center text-xs font-semibold text-slate-500">عذراً، لم نجد أي تطابق لبحثك.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          aria-label={unread > 0 ? `الإشعارات، ${unread} إشعار` : "الإشعارات"}
          onClick={() => navigate("/notifications")}
          className="relative rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600 transition-all hover:bg-blue-50 hover:text-blue-600"
        >
          <Bell size={18} />
          {/* النقطة كانت ظاهرة دايماً حتى لو مفيش إشعارات */}
          {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-600 ring-2 ring-white" />}
        </button>

        <div className="hidden h-7 w-px bg-slate-200 sm:block" />

        {loading ? (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-2xl bg-slate-100 motion-safe:animate-pulse" />
            <div className="hidden space-y-1.5 sm:block">
              <div className="h-3 w-24 rounded bg-slate-100 motion-safe:animate-pulse" />
              <div className="h-2 w-12 rounded bg-slate-100 motion-safe:animate-pulse" />
            </div>
          </div>
        ) : !user ? (
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition-all hover:bg-blue-700"
          >
            <LogIn size={16} />
            تسجيل الدخول
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="group flex cursor-pointer items-center gap-3 text-right"
          >
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-[2px] font-bold text-white shadow-md shadow-blue-600/20 transition-all group-hover:scale-105">
              {user.avatar ? (
                <img src={user.avatar} alt="" className="h-full w-full rounded-[14px] object-cover" />
              ) : (
                <span className="text-sm">{initial}</span>
              )}
            </div>

            <div className="hidden text-right sm:block">
              <p className="max-w-[160px] truncate text-sm font-bold tracking-wide text-slate-900 transition-all group-hover:text-blue-600">
                {user.name}
              </p>
              <p className={cx("max-w-[120px] truncate text-[10px] font-semibold tracking-wider text-blue-600")}>
                {user.role}
              </p>
            </div>
          </button>
        )}

        {user && onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
            className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600 transition-all hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </header>
  );
}