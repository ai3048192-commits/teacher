import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AlertTriangle, Loader2, LogOut } from "lucide-react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import TeacherDashboardLayout from "./components/TeacherDashboardLayout";
import { supabase } from "./lib/supabaseClient";

import HomePage from "./pages/HomePage";
import TeacherCourse from "./pages/TeacherCourse";
import TeacherContent from "./pages/TeacherContent";
import TeacherAssessments from "./pages/TeacherGrading";
import CourseAttendanceAndSubscriptions from "./pages/CourseAttendanceAndSubscriptions";
import AdminTeacherSubscriptions from "./pages/AdminTeacherSubscriptions";
import TeacherStudentSubscriptions from "./pages/TeacherStudentSubscriptions";
import NotificationsAlerts from "./pages/NotificationsAlerts";
import TeacherLive from "./pages/TeacherLive";
import Profile from "./pages/Profile";

import "./index.css";

/* ================================================================== */
/*  إعدادات                                                             */
/* ================================================================== */

const LOGIN_URL = import.meta.env.VITE_LOGIN_URL ?? "/login";
const STUDENT_HOME = import.meta.env.VITE_STUDENT_HOME ?? "/student";

type Access = "loading" | "guest" | "not-teacher" | "teacher";

/* ================================================================== */
/*  شاشات الحالة (بتصميم احترافي مميز)                                 */
/* ================================================================== */

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-4 text-slate-700 sm:p-6" dir="rtl">
      {/* دوائر إضاءة خافتة في الخلفية */}
      <div className="absolute -top-40 left-0 h-96 w-96 rounded-full bg-blue-400/20 mix-blend-multiply blur-[100px]"></div>
      <div className="absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-indigo-400/20 mix-blend-multiply blur-[100px]"></div>

      {/* الكارت الأساسي بتصميم زجاجي حديث */}
      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/60 bg-white/80 p-8 pt-10 text-center shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_16px_60px_-15px_rgba(0,0,0,0.15)] sm:p-10">
        
        {/* شريط متدرج ديكوري أعلى الكارت */}
        <div className="absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

        <div className="flex flex-col items-center justify-center space-y-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  التطبيق                                                             */
/* ================================================================== */

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access>("loading");

  const userId = session?.user?.id ?? "";

  const resolveAccess = useCallback(async (current: Session | null) => {
    if (!current?.user) {
      setSession(null);
      setAccess("guest");
      return;
    }
    setSession(current);

    const { data } = await supabase.from("profiles").select("role").eq("id", current.user.id).maybeSingle();
    const role = data?.role ?? current.user.user_metadata?.role;
    setAccess(role === "teacher" ? "teacher" : "not-teacher");
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) void resolveAccess(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, current) => {
      if (active) void resolveAccess(current);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [resolveAccess]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.replace(LOGIN_URL);
  };

  /* ---------- الحالات قبل الدخول ---------- */

  if (access === "loading") {
    return (
      <div className="flex h-screen items-center justify-center gap-2 font-bold text-slate-600" dir="rtl">
        <Loader2 className="animate-spin" size={22} />
        جاري التحميل...
      </div>
    );
  }

  if (access === "guest") {
    return (
      <FullScreen>
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100/50 shadow-inner">
          <AlertTriangle size={38} className="text-amber-500" strokeWidth={1.5} />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">مرحباً بك!</h1>
          <p className="text-sm font-medium leading-relaxed text-slate-500">
            يجب تسجيل الدخول أولاً لتتمكن من الوصول إلى لوحة تحكم المعلم.
          </p>
        </div>

        <a
          href={LOGIN_URL}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 hover:shadow-blue-500/40 active:translate-y-0"
        >
          تسجيل الدخول الآن
        </a>
      </FullScreen>
    );
  }

  if (access === "not-teacher") {
    return (
      <FullScreen>
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-100/50 shadow-inner">
          <AlertTriangle size={38} className="text-rose-500" strokeWidth={1.5} />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">عذراً، لا تملك صلاحية</h1>
          <p className="text-sm font-medium leading-relaxed text-slate-500">
            هذه اللوحة مخصصة للمعلمين فقط. حسابك الحالي مسجل كطالب.
          </p>
        </div>

        <div className="mt-4 flex w-full flex-col gap-3">
          <a
            href={STUDENT_HOME}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 hover:shadow-blue-500/40 active:translate-y-0"
          >
            الذهاب للوحة الطالب
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-3.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut size={18} />
            تسجيل الخروج
          </button>
        </div>
      </FullScreen>
    );
  }

  /* ---------- لوحة المعلم ---------- */

  return (
    <div className="flex h-screen overflow-hidden" dir="rtl">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} onSignOut={handleSignOut} />

      <div className="flex h-full flex-1 flex-col overflow-hidden transition-all lg:pr-72">
        <Header onOpenSidebar={() => setIsSidebarOpen(true)} onSignOut={handleSignOut} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-[1600px]">
            <TeacherDashboardLayout user={session?.user ?? null}>
              <Routes>
                <Route path="/" element={<HomePage userId={userId} />} />
                <Route path="/teacher-courses" element={<TeacherCourse />} />
                <Route path="/teacher-content" element={<TeacherContent />} />
                <Route path="/teacher-grading" element={<TeacherAssessments />} />
                <Route path="/teacher-grades" element={<CourseAttendanceAndSubscriptions userId={userId} />} />
                <Route
                  path="/teacher-subscriptions"
                  element={<AdminTeacherSubscriptions user={session?.user ?? null} onSuccess={() => window.location.reload()} />}
                />
                <Route path="/teacher-notifications" element={<NotificationsAlerts />} />
                <Route path="/teacher-live" element={<TeacherLive />} />
                <Route path="/teacher-student-subscriptions" element={<TeacherStudentSubscriptions />} />
                <Route path="/teacher-profile" element={<Profile userId={userId} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </TeacherDashboardLayout>
          </div>
        </main>
      </div>
    </div>
  );
}
