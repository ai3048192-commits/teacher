import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  BookMarked,
  BookOpen,
  Calendar,
  CheckCheck,
  Clock,
  FileCheck,
  Loader2,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

/* ================================================================== */
/*  Types & constants                                                 */
/* ================================================================== */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface Section<T> {
  items: T[];
  total: number;
}

interface CourseSummary {
  id: number;
  name: string;
  specialty: string;
  status: string;
  showTimes: string;
}

interface QuizSummary {
  id: number;
  courseName: string;
  specialty: string;
  startDate: string;
  dueDate: string;
}

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  source: string;
  time: string;
  createdAt: string;
}

type QuizStatus = "active" | "scheduled" | "ended";

const PREVIEW_LIMIT = 6;
const FALLBACK_TEACHER_NAME = "الأستاذ المتميز";
const LOCALE = "ar-EG-u-nu-latn";

const QUIZ_BADGE: Record<QuizStatus, { label: string; className: string }> = {
  active: { label: "اختبار نشط", className: "bg-blue-600 text-white" },
  scheduled: { label: "لم يبدأ بعد", className: "bg-blue-100 text-blue-700" },
  ended: { label: "انتهى موعده", className: "bg-slate-100 text-slate-500" },
};

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

// يدعم صيغ datetime-local وtimestamptz والصيغة اللي بترجع من Realtime
const toTimestamp = (value?: string | null): number | null => {
  if (!value) return null;
  const s = String(value)
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

const formatDateTime = (value?: string | null, fallback = "غير محدد") => {
  const t = toTimestamp(value);
  if (t === null) return value ? String(value) : fallback;
  return new Date(t).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });
};

const relativeTime = (t: number) => {
  const diffSeconds = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  if (abs < 60) return rtf.format(diffSeconds, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSeconds / 86400), "day");
  return new Date(t).toLocaleDateString(LOCALE, { dateStyle: "medium" });
};

// عمود time ممكن يكون نص جاهز (زي "منذ ساعة") أو تاريخ؛ بنعرض الموجود بدل ما نكتب "حديثاً" دايماً
const notificationTime = (n: NotificationItem) => {
  const t = toTimestamp(n.time) ?? toTimestamp(n.createdAt);
  if (t !== null) return relativeTime(t);
  return n.time || "حديثاً";
};

const getQuizStatus = (quiz: QuizSummary, now: number): QuizStatus => {
  const due = toTimestamp(quiz.dueDate);
  const start = toTimestamp(quiz.startDate);
  if (due !== null && due < now) return "ended";
  if (start !== null && start > now) return "scheduled";
  return "active";
};

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
};

/* ================================================================== */
/*  Data layer (Supabase)                                             */
/* ================================================================== */

async function fetchTeacherName(userId?: string): Promise<string | null> {
  // بدل الـ ID الوهمي: لو الصفحة ماخدتش userId نستخدم المستخدم المسجل دخوله فعلاً
  const id = userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!id) return null;
  const { data, error } = await supabase.from("teachers_profile").select("name").eq("user_id", id).maybeSingle();
  if (error) throw error;
  return data?.name || null;
}

async function fetchCourses(): Promise<Section<CourseSummary>> {
  const { data, error, count } = await supabase
    .from("courses")
    .select("id, course_name, course_specialty, status, show_times", { count: "exact" })
    .order("id", { ascending: false })
    .limit(PREVIEW_LIMIT);
  if (error) throw error;
  return {
    total: count ?? data?.length ?? 0,
    items: (data ?? []).map((row: Row) => ({
      id: row.id,
      name: row.course_name || "بدون اسم",
      specialty: row.course_specialty || "عام",
      status: row.status || "active",
      showTimes: row.show_times || "",
    })),
  };
}

async function fetchQuizzes(): Promise<Section<QuizSummary>> {
  // أعمدة محددة بدل "*" عشان منجيبش قائمة الأسئلة كاملة لكل اختبار
  const { data, error } = await supabase
    .from("quizzes")
    .select("id, course_name, course_specialty, start_date, due_date")
    .order("id", { ascending: false });
  if (error) throw error;
  const items = (data ?? []).map((row: Row) => ({
    id: row.id,
    courseName: row.course_name || "بدون اسم",
    specialty: row.course_specialty || "عام",
    startDate: row.start_date || "",
    dueDate: row.due_date || "",
  }));
  return { items, total: items.length };
}

async function fetchSubmissionsCount(): Promise<number> {
  const { count, error } = await supabase.from("student_submissions").select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function fetchNotifications(): Promise<Section<NotificationItem>> {
  const { data, error, count } = await supabase
    .from("my_notifications")
    .select("*", { count: "exact" })
    .order("id", { ascending: false })
    .limit(PREVIEW_LIMIT);
  if (error) throw error;
  return {
    total: count ?? data?.length ?? 0,
    items: (data ?? []).map((row: Row) => ({
      id: row.id,
      title: row.title ?? "",
      message: row.message ?? "",
      source: row.recipient_label || "منصة zed التعليمية",
      time: row.time ?? "",
      createdAt: row.created_at ?? "",
    })),
  };
}

/* ================================================================== */
/*  UI primitives                                                     */
/* ================================================================== */

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("flex flex-col rounded-3xl border-2 border-blue-100 bg-white shadow-xs", className)}>
      {children}
    </section>
  );
}

function PanelHeader({ icon, title, subtitle, aside }: { icon: ReactNode; title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {aside}
    </div>
  );
}

function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 tabular-nums">
      {children}
    </span>
  );
}

function SkeletonList({ rows, className }: { rows: number; className?: string }) {
  return (
    <div className={cx("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 rounded-2xl border border-blue-100 bg-blue-50/40 motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/30 px-6 py-10 text-center">
      {icon}
      <p className="text-sm font-bold text-slate-700">{text}</p>
      {action}
    </div>
  );
}

/* ================================================================== */
/*  Page                                                              */
/* ================================================================== */

export default function HomePage({ userId }: { userId?: string }) {
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [courses, setCourses] = useState<Section<CourseSummary> | null>(null);
  const [quizzes, setQuizzes] = useState<Section<QuizSummary> | null>(null);
  const [submissionsCount, setSubmissionsCount] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<Section<NotificationItem> | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failedSections, setFailedSections] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  /* ---------- تحميل البيانات ---------- */

  // الطلبات بتتبعت مع بعض؛ لو واحد فشل الباقي بيكمل عادي بدل ما الصفحة كلها تفضى
  const loadAll = useCallback(async () => {
    const [name, coursesRes, quizzesRes, submissionsRes, notificationsRes] = await Promise.allSettled([
      fetchTeacherName(userId),
      fetchCourses(),
      fetchQuizzes(),
      fetchSubmissionsCount(),
      fetchNotifications(),
    ]);

    const failures: string[] = [];
    const settle = <T,>(result: PromiseSettledResult<T>, label: string, apply: (value: T) => void) => {
      if (result.status === "fulfilled") {
        apply(result.value);
      } else {
        console.error(`خطأ في جلب ${label}:`, result.reason);
        failures.push(label);
      }
    };

    // فشل جلب الاسم مش مستاهل رسالة خطأ؛ بنعرض الاسم الافتراضي
    if (name.status === "fulfilled") setTeacherName(name.value);
    else console.error("خطأ في جلب اسم المعلم:", name.reason);
    settle(coursesRes, "الكورسات", setCourses);
    settle(quizzesRes, "الاختبارات", setQuizzes);
    settle(submissionsRes, "التسليمات", setSubmissionsCount);
    settle(notificationsRes, "الإشعارات", setNotifications);

    setFailedSections(failures);
    setLoaded(true);
  }, [userId]);

  const reloadNotifications = useCallback(async () => {
    try {
      setNotifications(await fetchNotifications());
    } catch (err) {
      console.error("خطأ في تحديث الإشعارات:", err);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Realtime: أي تغيير في الإشعارات بيحدّث الإشعارات بس، مش الصفحة كلها
  const realtimeTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const channel = supabase
      .channel("home-notifications-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "my_notifications" }, () => {
        window.clearTimeout(realtimeTimer.current);
        realtimeTimer.current = window.setTimeout(() => void reloadNotifications(), 300);
      })
      .subscribe();

    return () => {
      window.clearTimeout(realtimeTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [reloadNotifications]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  // الإشعارات إعلانات عامة من الإدارة، فالحذف من الجدول كان بيخفيها عن كل
  // المعلمين. دلوقتي كل معلم بيخفي نسخته هو بس عن طريق notification_dismissals،
  // وسياسة RLS بتستبعد المخفي تلقائياً من نتيجة الاستعلام.
  const handleDeleteNotification = async (id: number) => {
    if (!window.confirm("هل تريد إخفاء هذا الإشعار من لوحتك؟")) return;
    setDeletingId(id);
    setDeleteError("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("يجب تسجيل الدخول أولاً.");

      const { error } = await supabase
        .from("notification_dismissals")
        .upsert({ notification_id: id, user_id: userId }, { onConflict: "notification_id,user_id" });
      if (error) throw error;

      setNotifications((prev) =>
        prev ? { items: prev.items.filter((n) => n.id !== id), total: Math.max(0, prev.total - 1) } : prev
      );
      void reloadNotifications(); // عشان المعاينة تكمل آخر 6 إشعارات
    } catch (err) {
      setDeleteError("تعذّر إخفاء الإشعار: " + errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------- بيانات العرض ---------- */

  const sortedQuizzes = useMemo(() => {
    const now = Date.now();
    const rank: Record<QuizStatus, number> = { active: 0, scheduled: 1, ended: 2 };
    return (quizzes?.items ?? [])
      .map((quiz) => ({ quiz, status: getQuizStatus(quiz, now) }))
      .sort((a, b) => {
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        const key = (x: typeof a) =>
          toTimestamp(x.status === "scheduled" ? x.quiz.startDate : x.quiz.dueDate) ?? Number.MAX_SAFE_INTEGER;
        return a.status === "ended" ? key(b) - key(a) : key(a) - key(b);
      });
  }, [quizzes]);

  const stats = [
    {
      title: "كورساتي الحالية",
      value: courses?.total,
      change: "نشط",
      period: "المواد الدراسية",
      icon: BookOpen,
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-200",
      to: "/teacher-courses",
    },
    {
      title: "الاختبارات المنشأة",
      value: quizzes?.total,
      change: "متاحة للطلاب",
      period: "التقييمات",
      icon: FileCheck,
      color: "text-blue-500",
      bg: "bg-blue-50 border-blue-200",
      to: "/teacher-grading",
    },
    {
      title: "تسليمات الطلاب",
      value: submissionsCount ?? undefined,
      change: "تم استلامها",
      period: "الأداء العام",
      icon: UploadCloud,
      color: "text-indigo-600",
      bg: "bg-indigo-50 border-indigo-200",
      to: "/teacher-grading",
    },
    {
      title: "التنبيهات والإشعارات",
      value: notifications?.total,
      change: "واردة ومحدثة",
      period: "سجل النشاطات",
      icon: Bell,
      color: "text-blue-700",
      bg: "bg-blue-50 border-blue-200",
      to: "/teacher-notifications",
    },
  ];

  const todayLabel = new Date().toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen space-y-6 bg-white pb-12 text-slate-800" dir="rtl">
      {/* ------------------------------ Header ------------------------------ */}
      <header className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 text-white shadow-xl sm:p-8">
        <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/25 px-3.5 py-1 text-xs font-bold backdrop-blur-md">
              <Sparkles size={13} />
              لوحة تحكم المعلم، منصة
              <span dir="ltr" className="tracking-[0.3em]">
                ZED
              </span>
            </span>

            <h1 className="text-2xl font-black leading-tight sm:text-4xl">
              أهلاً بك،{" "}
              {loaded ? (
                teacherName || FALLBACK_TEACHER_NAME
              ) : (
                <span className="inline-block h-8 w-40 rounded-lg bg-white/20 align-middle motion-safe:animate-pulse sm:h-10" />
              )}
            </h1>

            <p className="text-sm leading-relaxed text-blue-100 sm:text-base">
              إدارة الكورسات، متابعة الواجبات، وتقييم طلابك أصبحت أسهل وأكثر تنظيماً من مكان واحد.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-blue-100">
              <Calendar size={15} />
              {todayLabel}
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || !loaded}
              className={cx(
                FOCUS_RING,
                "inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/15 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-white/25 disabled:opacity-60"
              )}
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
              تحديث البيانات
            </button>
          </div>
        </div>
      </header>

      {failedSections.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600"
        >
          <span className="inline-flex items-center gap-2">
            <AlertCircle size={18} />
            تعذّر تحميل: {failedSections.join("، ")}. باقي البيانات ظاهرة بشكل طبيعي.
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-lg bg-white px-3 py-1.5 text-xs text-rose-600 transition-colors hover:bg-rose-100"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ------------------------------ Stats ------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ title, value, change, period, icon: Icon, color, bg, to }) => (
          <Link
            key={title}
            to={to}
            className={cx(
              FOCUS_RING,
              "flex flex-col rounded-2xl border-2 border-blue-100/80 bg-white p-5 shadow-xs transition duration-300 hover:border-blue-400 hover:shadow-lg"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={cx("grid h-11 w-11 place-items-center rounded-xl border", bg, color)}>
                <Icon size={22} />
              </span>
              <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                {change}
              </span>
            </div>
            <p className="mt-4 text-3xl font-black text-slate-900 tabular-nums">
              {value ??
                (loaded ? (
                  "—"
                ) : (
                  <span className="inline-block h-8 w-14 rounded-lg bg-blue-50 align-middle motion-safe:animate-pulse" />
                ))}
            </p>
            <p className="mt-1 text-sm font-bold text-slate-700">{title}</p>
            <p className="mt-0.5 text-xs font-medium text-blue-600/80">{period}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* ------------------------------ Quizzes ------------------------------ */}
        <Panel>
          <PanelHeader
            icon={<AlertCircle size={18} />}
            title="الاختبارات والواجبات المنشأة"
            aside={quizzes && <CountBadge>{quizzes.total} إجمالي</CountBadge>}
          />
          <div className="p-5 sm:p-6">
            {!loaded ? (
              <SkeletonList rows={3} />
            ) : sortedQuizzes.length === 0 ? (
              <EmptyState
                icon={<FileCheck size={28} className="text-blue-500" />}
                text={quizzes ? "لم تقم بإنشاء أي اختبارات أو واجبات بعد." : "تعذّر تحميل الاختبارات."}
              />
            ) : (
              <ul className="max-h-[420px] space-y-3 overflow-y-auto pl-1">
                {sortedQuizzes.map(({ quiz, status }) => {
                  const badge = QUIZ_BADGE[status];
                  return (
                    <li
                      key={quiz.id}
                      className={cx(
                        "space-y-2 rounded-2xl border p-4 transition-colors hover:border-blue-300",
                        status === "ended" ? "border-blue-100 bg-white" : "border-blue-100 bg-blue-50/40"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-bold", badge.className)}>
                          {badge.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                          <Clock size={13} className="text-blue-600" />
                          {status === "scheduled"
                            ? `يبدأ ${formatDateTime(quiz.startDate, "قريباً")}`
                            : `التسليم ${formatDateTime(quiz.dueDate, "قريباً")}`}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{quiz.courseName}</h3>
                        <p className="mt-0.5 text-xs font-medium text-blue-700">التخصص: {quiz.specialty}</p>
                      </div>
                      <Link
                        to="/teacher-grading"
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 transition-colors hover:text-blue-800"
                      >
                        متابعة إجابات الطلاب
                        <ArrowLeft size={13} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>

        {/* ------------------------------ Courses ------------------------------ */}
        <Panel className="lg:col-span-2">
          <PanelHeader
            icon={<BookMarked size={18} />}
            title="كورساتي وإدارة المحتوى"
            subtitle={
              courses && courses.total > courses.items.length
                ? `آخر ${courses.items.length} من ${courses.total} كورس`
                : undefined
            }
            aside={
              <Link
                to="/teacher-courses"
                className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 transition-colors hover:text-blue-700"
              >
                إدارة كل الكورسات
                <ArrowLeft size={15} />
              </Link>
            }
          />
          <div className="p-5 sm:p-6">
            {!loaded ? (
              <div className="grid gap-4 md:grid-cols-2">
                <SkeletonList rows={2} />
                <SkeletonList rows={2} className="hidden md:block" />
              </div>
            ) : !courses?.items.length ? (
              <EmptyState
                icon={<BookOpen size={32} className="text-blue-500" />}
                text={courses ? "ليس لديك أي كورسات مضافة حالياً." : "تعذّر تحميل الكورسات."}
                action={
                  courses && (
                    <Link
                      to="/teacher-courses"
                      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
                    >
                      أضف كورس جديد الآن
                    </Link>
                  )
                }
              />
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {courses.items.map((course) => {
                  const upcoming = course.status === "upcoming";
                  return (
                    <li
                      key={course.id}
                      className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/30 p-4 transition-colors hover:border-blue-300"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                          {course.specialty}
                        </span>
                        <span
                          className={cx(
                            "rounded border px-2 py-0.5 text-[11px] font-semibold",
                            upcoming
                              ? "border-blue-200 bg-blue-50 text-blue-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-600"
                          )}
                        >
                          {upcoming ? "قريباً" : "نشط"}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="line-clamp-2 text-sm font-bold text-slate-900">{course.name}</h3>
                        {course.showTimes && (
                          <p className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Calendar size={12} className="text-blue-600" />
                            {formatDateTime(course.showTimes)}
                          </p>
                        )}
                      </div>

                      <Link
                        to={`/teacher-content?courseId=${course.id}`}
                        className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
                      >
                        <PlayCircle size={15} />
                        إدارة محتوى الكورس
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      {/* ------------------------------ Notifications ------------------------------ */}
      <Panel>
        <PanelHeader
          icon={<Bell size={18} />}
          title="سجل التنبيهات والإشعارات"
          subtitle="متابعة آخر التحديثات الإدارية وتفاعلات الطلاب"
          aside={notifications && <CountBadge>{notifications.total} إشعار</CountBadge>}
        />

        <div className="space-y-4 p-5 sm:p-6">
          {deleteError && (
            <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-600">
              {deleteError}
            </p>
          )}

          {!loaded ? (
            <SkeletonList rows={3} />
          ) : !notifications?.items.length ? (
            <EmptyState
              icon={<CheckCheck size={28} className="text-blue-600" />}
              text={notifications ? "لا توجد إشعارات جديدة حالياً." : "تعذّر تحميل الإشعارات."}
            />
          ) : (
            <ul className="divide-y divide-blue-100 overflow-hidden rounded-2xl border border-blue-100">
              {notifications.items.map((n) => (
                <li key={n.id} className="flex items-start gap-3 bg-white p-4 transition-colors hover:bg-blue-50/30 sm:gap-4">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600">
                    <Bell size={16} />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded-lg border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-bold text-blue-700">
                        {n.source}
                      </span>
                      <span className="text-xs text-slate-400">{notificationTime(n)}</span>
                    </div>
                    {n.title && <h3 className="text-sm font-bold text-slate-900">{n.title}</h3>}
                    {n.message && <p className="text-sm leading-relaxed text-slate-600">{n.message}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteNotification(n.id)}
                    disabled={deletingId === n.id}
                    aria-label={`إخفاء الإشعار ${n.title}`}
                    title="إخفاء من لوحتي"
                    className="shrink-0 rounded-lg bg-rose-50 p-2 text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-60"
                  >
                    {deletingId === n.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {notifications && notifications.total > notifications.items.length ? (
              <span className="text-xs text-slate-500">
                يظهر هنا آخر {notifications.items.length} من {notifications.total} إشعار
              </span>
            ) : (
              <span />
            )}
            <Link
              to="/teacher-notifications"
              className={cx(
                FOCUS_RING,
                "inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
              )}
            >
              عرض كل الإشعارات
              <ArrowLeft size={14} />
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}