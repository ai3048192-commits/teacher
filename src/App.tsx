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
/*  إعدادات                                                            */
/* ================================================================== */

// صفحة تسجيل الدخول. لو صفحة الدخول جوه نفس التطبيق، سيبها "/login".
const LOGIN_URL = import.meta.env.VITE_LOGIN_URL ?? "/login";
const STUDENT_HOME = import.meta.env.VITE_STUDENT_HOME ?? "/student";

type Access = "loading" | "guest" | "not-teacher" | "teacher";

/* ================================================================== */
/*  شاشات الحالة                                                       */
/* ================================================================== */

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center p-4 text-slate-700" dir="rtl">
      <div className="max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        {children}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  التطبيق                                                            */
/* ================================================================== */

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access>("loading");

  // هوية المستخدم بتيجي من الجلسة نفسها، مش من الـ URL.
  const userId = session?.user?.id ?? "";

  const resolveAccess = useCallback(async (current: Session | null) => {
    if (!current?.user) {
      setSession(null);
      setAccess("guest");
      return;
    }
    setSession(current);

    // نوع الحساب محسوم من قاعدة البيانات، والمستخدم مش بيقدر يغيّره
    const { data } = await supabase.from("profiles").select("role").eq("id", current.user.id).maybeSingle();
    const role = data?.role ?? current.user.user_metadata?.role;
    setAccess(role === "teacher" ? "teacher" : "not-teacher");
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) void resolveAccess(data.session);
    });

    // تسجيل خروج أو انتهاء الجلسة بيتعامل معاه فوراً بدل ما الصفحة تفضل فاضية
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
    // الكود القديم كان بيعرض الداشبورد كامل حتى من غير تسجيل دخول،
    // فكانت كل الصفحات بتطلع فاضية من غير ما حد يفهم السبب.
    return (
      <FullScreen>
        <AlertTriangle size={36} className="mx-auto text-amber-500" />
        <h1 className="text-lg font-black text-slate-900">يجب تسجيل الدخول للدخول على لوحة المعلم</h1>
        <p className="text-sm text-slate-500">انتهت جلستك أو لم تسجّل الدخول بعد.</p>
        <a
          href={LOGIN_URL}
          className="inline-block rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-blue-700"
        >
          الذهاب لصفحة تسجيل الدخول
        </a>
      </FullScreen>
    );
  }

  if (access === "not-teacher") {
    return (
      <FullScreen>
        <AlertTriangle size={36} className="mx-auto text-rose-500" />
        <h1 className="text-lg font-black text-slate-900">هذه اللوحة مخصصة للمعلمين</h1>
        <p className="text-sm text-slate-500">حسابك مسجّل كطالب، ولا يمكنه الوصول إلى بيانات المعلمين.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <a
            href={STUDENT_HOME}
            className="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            الذهاب للوحة الطالب
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200"
          >
            <LogOut size={15} />
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
              {/* userId بيتبعت للصفحات اللي بتستقبله بس. الباقي بيقرا الجلسة
                  بنفسه ويعتمد على RLS، وبعت prop مش موجود كان بيطلع خطأ. */}
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
                {/* أي مسار غلط يرجّع للصفحة الرئيسية بدل صفحة بيضا */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </TeacherDashboardLayout>
          </div>
        </main>
      </div>
    </div>
  );
}