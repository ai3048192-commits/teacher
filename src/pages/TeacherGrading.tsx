import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileText,
  History,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

/* ================================================================== */
/*  Types & helpers                                                   */
/* ================================================================== */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface Attempt {
  id: number;
  number: number; // رقم المحاولة: 1، 2، 3...
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  time: string;
  answers: Row | null;
}

interface StudentQuizGroup {
  key: string;
  studentName: string;
  courseName: string;
  specialty: string;
  allowedAttempts: number | null;
  attempts: Attempt[]; // من الأقدم للأحدث
  latest: Attempt;
  best: Attempt;
}

const PASS_PERCENT = 50;
const LOCALE = "ar-EG-u-nu-latn";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

const formatTime = (row: Row) => {
  if (row.submission_time) return String(row.submission_time);
  const t = Date.parse(String(row.created_at ?? "").replace(" ", "T"));
  return Number.isNaN(t) ? "غير محدد" : new Date(t).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });
};

const toAttempt = (row: Row, number: number): Attempt => {
  const score = Number(row.score) || 0;
  const maxScore = Number(row.max_score) > 0 ? Number(row.max_score) : 100;
  const percentage = Math.round((score / maxScore) * 100);
  // الحالة بتتحسب من الدرجة نفسها. الكود القديم كان بيكتب "ناجح" لأي
  // تسليم مفيهوش status، حتى لو الطالب واخد صفر.
  const passed = row.status ? row.status !== "راسب" : percentage >= PASS_PERCENT;
  return { id: row.id, number, score, maxScore, percentage, passed, time: formatTime(row), answers: row.student_answers ?? null };
};

// مفتاح التجميع: الطالب + الاختبار.
// الكود القديم كان بيجمّع بـ student_id بس، والطلاب الجداد مسجّلين بـ user_id
// و student_id فاضي، فكل الطلاب كانوا هيتجمعوا في كارت واحد.
const groupKey = (row: Row) =>
  `${row.user_id ?? row.student_id ?? row.student_name ?? "?"}__${row.quiz_id ?? row.course_name ?? "?"}`;

/* ================================================================== */
/*  عرض الإجابات                                                        */
/* ================================================================== */

function AnswersView({ answers }: { answers: Row | null }) {
  const mcq: Row = answers?.mcq_answers || {};
  const essay: Row = answers?.essay_answers || {};
  const files: Row = answers?.uploaded_files || {};

  if (!Object.keys(mcq).length && !Object.keys(essay).length && !Object.keys(files).length) {
    return <p className="py-2 text-center text-slate-500">لا توجد تفاصيل إجابات مسجلة لهذه المحاولة.</p>;
  }

  return (
    <div className="space-y-3.5">
      {Object.keys(mcq).length > 0 && (
        <div className="space-y-2">
          <span className="block border-b border-blue-100 pb-1 font-extrabold text-blue-700">أسئلة الاختيار من متعدد:</span>
          {Object.entries(mcq).map(([q, ans]) => (
            <div key={q} className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs">
              <span className="font-semibold text-slate-500">السؤال ({Number(q) + 1})</span>
              <span className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 font-black text-slate-900">{String(ans)}</span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(essay).length > 0 && (
        <div className="space-y-2">
          <span className="block border-b border-indigo-100 pb-1 font-extrabold text-indigo-700">الأسئلة المقالية:</span>
          {Object.entries(essay).map(([q, ans]) => (
            <div key={q} className="space-y-1.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
              <span className="block font-semibold text-slate-500">إجابة السؤال ({Number(q) + 1})</span>
              <p className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 font-medium leading-relaxed text-slate-800">
                {String(ans) || "لم يكتب إجابة"}
              </p>
            </div>
          ))}
        </div>
      )}

      {Object.keys(files).length > 0 && (
        <div className="space-y-2">
          <span className="block border-b border-emerald-100 pb-1 font-extrabold text-emerald-700">الملفات المرفقة:</span>
          {Object.entries(files).map(([q, file]: [string, Row]) => (
            <div key={q} className="flex items-center justify-between rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-2.5">
              <span className="font-semibold text-slate-600">ملف السؤال ({Number(q) + 1})</span>
              {file?.url ? (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex max-w-[180px] items-center gap-1.5 truncate font-bold text-emerald-700 underline hover:text-emerald-900"
                >
                  <FileText size={14} />
                  <span className="truncate">{file.name || "فتح الملف"}</span>
                </a>
              ) : (
                <span className="text-slate-400">غير متاح</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  الصفحة                                                             */
/* ================================================================== */

export default function StudentsSubmissionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [allowedByQuiz, setAllowedByQuiz] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openAttempt, setOpenAttempt] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchSubmissions = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      // RLS بترجّع تسليمات اختبارات المعلم الحالي بس
      const { data, error: err } = await supabase
        .from("student_submissions")
        .select("*")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (err) throw err;
      const list = data ?? [];
      setRows(list);

      // عدد المحاولات المسموح بيه لكل اختبار، عشان نعرض "3 من 5"
      const quizIds = [...new Set(list.map((r: Row) => r.quiz_id).filter(Boolean))];
      if (quizIds.length) {
        const { data: quizzes } = await supabase.from("quizzes").select("id, allowed_attempts").in("id", quizIds);
        setAllowedByQuiz(
          new Map((quizzes ?? []).filter((q: Row) => q.allowed_attempts).map((q: Row) => [q.id, Number(q.allowed_attempts)]))
        );
      }
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      console.error("خطأ في جلب درجات الطلاب:", msg);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchSubmissions();

    const channel = supabase
      .channel("teacher_grading_submissions")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_submissions" }, () => {
        // تحديث هادي من غير ما الصفحة كلها تتحول لشاشة تحميل مع كل تسليم جديد
        void fetchSubmissions(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchSubmissions]);

  /* ---------- تجميع المحاولات ---------- */

  const groups = useMemo<StudentQuizGroup[]>(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const key = groupKey(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }

    const result: StudentQuizGroup[] = [];
    for (const [key, list] of map) {
      const attempts = list.map((row, i) => toAttempt(row, i + 1));
      const latest = attempts[attempts.length - 1];
      const best = attempts.reduce((a, b) => (b.percentage > a.percentage ? b : a));
      const first = list[0];
      result.push({
        key,
        studentName: first.student_name || "طالب",
        courseName: first.course_name || "غير محدد",
        specialty: first.specialty || "عام",
        allowedAttempts: first.quiz_id ? allowedByQuiz.get(first.quiz_id) ?? null : null,
        attempts,
        latest,
        best,
      });
    }

    // الأحدث تسليماً فوق
    return result.sort((a, b) => b.latest.id - a.latest.id);
  }, [rows, allowedByQuiz]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) => g.studentName.toLowerCase().includes(q) || g.courseName.toLowerCase().includes(q)
    );
  }, [groups, searchTerm]);

  const totalAttempts = filtered.reduce((sum, g) => sum + g.attempts.length, 0);

  /* ---------- حذف محاولة ---------- */

  const handleDeleteAttempt = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه المحاولة نهائياً؟")) return;
    setDeletingId(id);
    try {
      const { data, error: err } = await supabase.from("student_submissions").delete().eq("id", id).select("id");
      if (err) throw err;
      // الكود القديم كان بيشيل الكارت من الشاشة حتى لو الحذف اترفض،
      // فالتسليم كان يرجع تاني مع أول تحديث.
      if (!data?.length) throw new Error("لم يتم الحذف. غالباً صلاحيات RLS في Supabase تمنع العملية.");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      alert("تعذّر حذف المحاولة: " + msg);
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------- الواجهة ---------- */

  return (
    <div className="min-h-screen space-y-6 pb-12 text-slate-800" dir="rtl">
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-l from-indigo-900 via-slate-900 to-blue-950 p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3.5 py-1 text-xs font-semibold text-indigo-200 backdrop-blur-md">
            <Sparkles size={14} className="text-amber-400" />
            <span>
              لوحة تقييم الطلاب الذكية، منصة{" "}
              <span dir="ltr" className="tracking-[0.3em]">
                ZED
              </span>
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">درجات واختبارات الطلاب الإحترافية</h1>
          <p className="max-w-2xl text-xs leading-relaxed text-slate-300 sm:text-sm">
            كل محاولات الطالب في كل اختبار، بدرجة كل محاولة وإجاباتها والملفات المرفقة.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:flex-row">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
          <input
            type="search"
            placeholder="بحث باسم الطالب أو الكورس..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-10 text-xs font-medium text-slate-800 placeholder:text-slate-400 transition-all focus:border-indigo-600 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <div className="rounded-xl border border-slate-200/60 bg-slate-100/80 px-3 py-2 text-xs font-medium text-slate-600">
            <span className="font-bold text-indigo-600 tabular-nums">{filtered.length}</span> طالب،{" "}
            <span className="font-bold text-indigo-600 tabular-nums">{totalAttempts}</span> محاولة
          </div>
          <button
            type="button"
            onClick={() => void fetchSubmissions(true)}
            disabled={refreshing || loading}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-indigo-200/60 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 transition-all hover:bg-indigo-100 active:scale-95 disabled:opacity-60"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            تحديث البيانات
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 py-24 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-xs font-medium text-slate-500">جاري جلب محاولات الطلاب...</p>
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-3xl border border-rose-200 bg-rose-50 py-12 text-center">
          <AlertCircle size={32} className="mx-auto text-rose-500" />
          <p className="text-sm font-bold text-rose-700">تعذّر جلب التسليمات</p>
          <p className="text-xs text-rose-600">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white py-16 text-center shadow-xs">
          <AlertCircle size={32} className="mx-auto text-indigo-500" />
          <p className="text-xs font-semibold text-slate-600 sm:text-sm">
            {searchTerm ? "لا توجد تسليمات مطابقة لبحثك." : "لا توجد تسليمات من الطلاب حتى الآن."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {filtered.map((g) => {
            const isOpen = openGroup === g.key;
            const count = g.attempts.length;

            return (
              <div
                key={g.key}
                className="flex flex-col space-y-4 rounded-3xl border-2 border-slate-200/70 bg-white p-5 shadow-sm transition-all duration-300 hover:border-indigo-500/60 hover:shadow-lg sm:p-6"
              >
                {/* الطالب + حالة آخر محاولة + عدد المحاولات */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-100 bg-gradient-to-tr from-indigo-50 to-blue-50 text-indigo-600 shadow-xs">
                      <Users size={22} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h3 className="truncate text-base font-black tracking-tight text-slate-900">{g.studentName}</h3>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cx(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold",
                            g.latest.passed
                              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                              : "border-rose-200 bg-rose-50 text-rose-600"
                          )}
                        >
                          {g.latest.passed ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                          {g.latest.passed ? "ناجح" : "راسب"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">
                          <History size={11} />
                          {g.allowedAttempts ? `${count} من ${g.allowedAttempts} محاولات` : `${count} ${count === 1 ? "محاولة" : "محاولات"}`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* آخر محاولة + أعلى درجة */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-indigo-900 to-slate-900 px-3.5 py-2.5 text-white shadow-sm">
                    <span className="block text-[9px] font-semibold uppercase tracking-wider text-indigo-300">آخر محاولة</span>
                    <div className="flex items-baseline gap-1">
                      <strong className="text-lg font-black tabular-nums">{g.latest.score}</strong>
                      <span className="text-[10px] text-slate-400">/ {g.latest.maxScore}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                    <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
                      <TrendingUp size={11} /> أعلى درجة
                    </span>
                    <div className="flex items-baseline gap-1">
                      <strong className="text-lg font-black tabular-nums text-emerald-800">{g.best.score}</strong>
                      <span className="text-[10px] text-emerald-600">/ {g.best.maxScore}</span>
                      <span className="text-[10px] text-emerald-600">(المحاولة {g.best.number})</span>
                    </div>
                  </div>
                </div>

                {/* الكورس والتخصص */}
                <div className="grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
                  <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <BookOpen size={14} />
                    </div>
                    <div className="truncate">
                      <span className="block text-[10px] font-medium text-slate-400">الكورس</span>
                      <span className="block truncate font-bold text-slate-800">{g.courseName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200/60 bg-slate-50 p-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <Layers size={14} />
                    </div>
                    <div className="truncate">
                      <span className="block text-[10px] font-medium text-slate-400">التخصص</span>
                      <span className="block truncate font-bold text-indigo-700">{g.specialty}</span>
                    </div>
                  </div>
                </div>

                {/* كل المحاولات */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenGroup(isOpen ? null : g.key);
                      setOpenAttempt(null);
                    }}
                    className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-100/80 p-3 text-xs font-bold text-slate-700 transition-all hover:bg-slate-100"
                  >
                    <span className="flex items-center gap-2">
                      <Eye size={15} className="text-indigo-600" />
                      عرض كل المحاولات ({count})
                    </span>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {isOpen && (
                    <ol className="space-y-2">
                      {/* الأحدث فوق */}
                      {[...g.attempts].reverse().map((a) => {
                        const answersOpen = openAttempt === a.id;
                        const isBest = a.id === g.best.id && count > 1;
                        return (
                          <li key={a.id} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-lg bg-indigo-600 px-2 py-0.5 text-[10px] font-black text-white">
                                  المحاولة {a.number}
                                </span>
                                <strong className="font-black tabular-nums text-slate-900">
                                  {a.score} / {a.maxScore}
                                </strong>
                                <span className="text-[10px] tabular-nums text-slate-500">({a.percentage}%)</span>
                                <span
                                  className={cx(
                                    "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                                    a.passed
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                                      : "border-rose-200 bg-rose-50 text-rose-600"
                                  )}
                                >
                                  {a.passed ? "ناجح" : "راسب"}
                                </span>
                                {isBest && (
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                    أعلى درجة
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleDeleteAttempt(a.id)}
                                disabled={deletingId === a.id}
                                title="حذف هذه المحاولة"
                                aria-label={`حذف المحاولة ${a.number}`}
                                className="cursor-pointer rounded-xl border border-rose-200/60 bg-rose-50 p-2 text-rose-600 transition-all hover:bg-rose-100 disabled:opacity-60"
                              >
                                {deletingId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="flex items-center gap-1.5 text-slate-500">
                                <Clock size={12} className="text-amber-500" />
                                {a.time}
                              </span>
                              <button
                                type="button"
                                onClick={() => setOpenAttempt(answersOpen ? null : a.id)}
                                className="font-bold text-indigo-600 hover:text-indigo-800"
                              >
                                {answersOpen ? "إخفاء الإجابات" : "عرض الإجابات"}
                              </button>
                            </div>

                            {answersOpen && (
                              <div className="rounded-2xl border border-slate-200 bg-white/60 p-3">
                                <AnswersView answers={a.answers} />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
