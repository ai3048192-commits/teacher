import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  BookOpen,
  CreditCard,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Radio,
  Shield,
  ShieldCheck,
  UploadCloud,
  User,
  Video,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

interface MenuItem {
  name: string;
  icon: React.ElementType;
  path: string;
  /** لو true، الرقم اللي جنبه بييجي من عدد الإشعارات الحقيقي */
  showCount?: boolean;
}

const menuItems: MenuItem[] = [
  { name: "الصفحة الرئيسية", icon: LayoutDashboard, path: "/" },
  { name: "إدارة الكورسات", icon: BookOpen, path: "/teacher-courses" },
  { name: "رفع المحتوى والدروس", icon: Video, path: "/teacher-content" },
  { name: "إدارة البث المباشر", icon: Radio, path: "/teacher-live" },
  { name: "تصحيح الواجبات", icon: UploadCloud, path: "/teacher-grading" },
  { name: "حضور وغياب الطلاب", icon: GraduationCap, path: "/teacher-grades" },
  { name: "اشتراكات الطلاب", icon: CreditCard, path: "/teacher-student-subscriptions" },
  { name: "إدارة اشتراكات الأدمن", icon: Shield, path: "/teacher-subscriptions" },
  { name: "الإشعارات والتنبيهات", icon: Bell, path: "/teacher-notifications", showCount: true },
  { name: "الملف الشخصي", icon: User, path: "/teacher-profile" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  /** يأتي من App ويقوم بتسجيل خروج حقيقي ثم التحويل لصفحة الدخول */
  onSignOut?: () => void;
}

export default function TeacherSidebar({ isOpen, onClose, onSignOut }: SidebarProps) {
  const location = useLocation();
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  // الرقم كان مكتوب "3" ثابت في الكود
  useEffect(() => {
    let active = true;
    supabase
      .from("my_notifications")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        if (active) setNotificationsCount(count ?? 0);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    if (onSignOut) {
      onSignOut();
      return;
    }
    // احتياطي لو الكمبوننت اتستخدم من غير onSignOut:
    // الكود القديم كان بيعمل navigate("/login") بس من غير ما يقفل الجلسة أصلاً.
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-md transition-opacity lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        aria-label="القائمة الجانبية للمدرس"
        className={`fixed right-0 top-0 z-50 h-screen w-72 transform border-l border-slate-200 bg-white text-slate-700 shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-400" />

        <div className="flex h-full flex-col justify-between p-5">
          <div className="space-y-6 overflow-y-auto pr-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-2xl border border-blue-100 bg-blue-50 p-2.5 text-blue-600 shadow-sm">
                  <Layers size={22} />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-wide text-slate-900">منصة التعلم الذكي</h2>
                  <span className="mt-0.5 block text-[11px] font-semibold tracking-wider text-blue-600">
                    لوحة تحكم المعلم
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق القائمة"
                className="shrink-0 rounded-xl border border-slate-200 bg-slate-100 p-2 text-slate-500 transition-all hover:text-slate-900 lg:hidden"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="space-y-1.5">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                const badge = item.showCount && notificationsCount > 0 ? String(notificationsCount) : null;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    aria-current={isActive ? "page" : undefined}
                    className={`group relative flex items-center justify-between rounded-2xl px-3.5 py-3 text-sm font-medium transition-all duration-300 ${
                      isActive
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                        : "text-slate-600 hover:bg-blue-50/60 hover:text-blue-600"
                    }`}
                  >
                    <span className="relative z-10 flex items-center gap-3">
                      <span
                        className={`shrink-0 rounded-xl p-2 transition-all duration-300 ${
                          isActive
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-500 group-hover:bg-blue-100/50 group-hover:text-blue-600"
                        }`}
                      >
                        <Icon size={18} />
                      </span>
                      <span className="tracking-wide">{item.name}</span>
                    </span>

                    {badge && (
                      <span
                        className={`relative z-10 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                          isActive ? "bg-white text-blue-600" : "bg-blue-100 text-blue-600"
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-auto space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span className="block text-xs font-semibold text-slate-700">النظام يعمل بكفاءة</span>
              </div>
              <ShieldCheck size={16} className="text-blue-600" />
            </div>

            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="group flex w-full items-center justify-center gap-2.5 rounded-2xl border border-rose-100 p-3 text-sm font-semibold text-rose-600 shadow-sm transition-all hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:opacity-60"
            >
              <LogOut size={18} className="transition-transform duration-300 group-hover:-translate-x-1" />
              {signingOut ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}