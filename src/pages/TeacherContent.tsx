import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import {
  Activity,
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Download,
  Edit3,
  FileArchive,
  FileCheck,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderArchive,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Loader2,
  PlayCircle,
  PlusCircle,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import JSZip from "jszip";
import { supabase } from "../lib/supabaseClient";

/* ================================================================== */
/*  Types                                                             */
/* ================================================================== */

type TabKey = "video" | "file" | "quiz";
type TableName = "courses" | "course_files" | "quizzes";
type NoticeType = "success" | "error";
type Notify = (type: NoticeType, text: string) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface VideoItem {
  id: number;
  title: string;
  inputType: "url" | "upload";
  mediaUrl: string;
  fileName: string;
  fileSize: string;
  preview: string;
}

interface Course {
  id: number;
  courseName: string;
  specialty: string;
  isFree: boolean;
  price: number;
  status: string;
  showTimes: string;
  courseDesc: string;
  videosList: VideoItem[];
}

interface StoredFile {
  name: string;
  size: string;
  type: string;
  data?: string;
}

interface FileRecord {
  id: number;
  courseName: string;
  specialty: string;
  title: string;
  filesInfo: StoredFile[];
  description: string;
}

interface Question {
  id: number;
  text: string;
  type: "mcq" | "essay";
  score: number;
  options: string[];
  correctAnswers: number[];
  modelAnswer: string;
}

interface Quiz {
  id: number;
  courseId: number;
  courseName: string;
  specialty: string;
  startDate: string;
  dueDate: string;
  quizDuration: string;
  allowedAttempts: number;
  questions: Question[];
}

interface RecordsProps<T> {
  records: T[];
  loading: boolean;
  reload: () => Promise<void>;
  remove: (id: number) => void;
  notify: Notify;
}

/* ================================================================== */
/*  Constants                                                         */
/* ================================================================== */

const TABS = [
  { key: "video", title: "كورسات الفيديو والمحاضرات", subtitle: "إدارة المرئيات", icon: Video },
  { key: "file", title: "الملفات والمستندات العامة", subtitle: "تحميل جماعي كـ ZIP", icon: FileText },
  { key: "quiz", title: "الاختبارات والواجبات", subtitle: "التقييمات والأسئلة", icon: HelpCircle },
] as const;

const VIDEO_SOURCES = [
  { value: "url", label: "رابط خارجي", icon: LinkIcon },
  { value: "upload", label: "ملف من الجهاز", icon: UploadCloud },
] as const;

const QUIZ_DURATIONS = [
  { value: "15", label: "15 دقيقة" },
  { value: "30", label: "30 دقيقة (نصف ساعة)" },
  { value: "45", label: "45 دقيقة" },
  { value: "60", label: "ساعة واحدة (60 دقيقة)" },
  { value: "90", label: "ساعة ونصف (90 دقيقة)" },
  { value: "120", label: "ساعتان (120 دقيقة)" },
];

const QUESTION_WORDS: PluralForms = ["سؤال واحد", "سؤالان", "أسئلة", "سؤال"];
const SCORE_WORDS: PluralForms = ["درجة واحدة", "درجتان", "درجات", "درجة"];
const ATTEMPT_WORDS: PluralForms = ["محاولة واحدة", "محاولتان", "محاولات", "محاولة"];

const RLS_HINT = "غالباً صلاحيات RLS في Supabase تمنع العملية، أو السجل لم يعد موجوداً.";

/* ================================================================== */
/*  Data layer (Supabase)                                             */
/* ================================================================== */

const mapCourse = (row: Row): Course => ({
  id: row.id,
  courseName: row.course_name ?? "",
  specialty: row.course_specialty || row.category || "عام",
  isFree: Boolean(row.is_free),
  price: Number(row.price) || 0,
  status: row.status || "active",
  showTimes: row.show_times || "",
  courseDesc: row.description || "",
  videosList: Array.isArray(row.videos_list) ? row.videos_list : [],
});

const mapFileRecord = (row: Row): FileRecord => ({
  id: row.id,
  courseName: row.course_name ?? "",
  specialty: row.specialty ?? "",
  title: row.title ?? "",
  filesInfo: Array.isArray(row.files_info) ? row.files_info : [],
  description: row.description ?? "",
});

const mapQuiz = (row: Row): Quiz => ({
  id: row.id,
  courseId: Number(row.course_id),
  courseName: row.course_name ?? "",
  specialty: row.course_specialty ?? "",
  startDate: row.start_date ?? "",
  dueDate: row.due_date ?? "",
  quizDuration: row.quiz_duration ? String(row.quiz_duration) : "",
  allowedAttempts: Number(row.allowed_attempts) || 1,
  questions: Array.isArray(row.questions_list) ? row.questions_list : [],
});

async function fetchRows<T>(table: TableName, mapRow: (row: Row) => T): Promise<T[]> {
  const { data, error } = await supabase.from(table).select("*").order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Row) => mapRow(row));
}

async function insertRow(table: TableName, payload: Row) {
  const { error } = await supabase.from(table).insert([payload]);
  if (error) throw error;
}

// .select() بترجع الصفوف اللي اتعدلت فعلاً؛ لو فاضية يبقى RLS منع التعديل من غير ما يرمي error
async function updateRow(table: TableName, id: number, payload: Row) {
  const { data, error } = await supabase.from(table).update(payload).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error(`لم يتم تعديل أي سجل في جدول ${table}. ${RLS_HINT}`);
}

async function deleteRow(table: TableName, id: number) {
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) {
    // 23503 = السجل مربوط بجدول تاني (مثلاً محاولات أو إجابات الطلاب)
    if (error.code === "23503") {
      throw new Error(
        "لا يمكن الحذف لأن السجل مرتبط ببيانات في جدول آخر (مثل محاولات أو إجابات الطلاب). احذف البيانات المرتبطة أولاً أو فعّل ON DELETE CASCADE."
      );
    }
    throw error;
  }
  if (!data?.length) throw new Error(`لم يتم حذف أي سجل من جدول ${table}. ${RLS_HINT}`);
}

function useRecords<T extends { id: number }>(
  table: TableName,
  mapRow: (row: Row) => T,
  notify: Notify,
  errorLabel: string
) {
  const [records, setRecords] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await fetchRows(table, mapRow));
    } catch (err) {
      console.error(errorLabel, err);
      notify("error", `${errorLabel}: ${errorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, [table, mapRow, notify, errorLabel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remove = useCallback((id: number) => {
    setRecords((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { records, loading, reload, remove };
}

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

type PluralForms = [one: string, two: string, few: string, many: string];

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
};

const toMB = (bytes: number, digits = 2) => `${(bytes / (1024 * 1024)).toFixed(digits)} MB`;

const countLabel = (n: number, [one, two, few, many]: PluralForms) => {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
};

// يحوّل أي قيمة تاريخ مخزنة لصيغة datetime-local عشان تظهر صح في الـ input عند التعديل
const toDateTimeLocal = (value?: string | null): string => {
  if (!value) return "";
  const s = String(value).trim().replace(" ", "T");
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s);
  if (!hasZone) return s.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)?.[0] ?? "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDateTime = (value?: string | null): string => {
  const local = toDateTimeLocal(value);
  if (!local) return value ? String(value) : "غير محدد";
  const d = new Date(local);
  return Number.isNaN(d.getTime())
    ? local
    : d.toLocaleString("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
};

const getYouTubeId = (url: string) =>
  url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1] ?? null;

const isDirectVideoUrl = (url: string) => /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url);

const fileKey = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").trim();

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function triggerDownload(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadStoredFile(file: StoredFile) {
  if (!file.data) return;
  try {
    // تحويل الـ data URL لـ Blob أضمن مع الملفات الكبيرة
    const blob = await (await fetch(file.data)).blob();
    const url = URL.createObjectURL(blob);
    triggerDownload(url, file.name);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    triggerDownload(file.data, file.name);
  }
}

async function downloadRecordAsZip(record: FileRecord) {
  const zip = new JSZip();
  const folder = zip.folder(safeFileName(record.title) || "Course_Files") ?? zip;
  const usedNames = new Map<string, number>();
  let added = 0;

  record.filesInfo.forEach((file, index) => {
    const base64 = file.data?.split(",")[1];
    if (!base64) return;

    // منع الملفات اللي ليها نفس الاسم من إنها تمسح بعض جوه الـ ZIP
    const baseName = file.name || `file_${index + 1}`;
    const seen = usedNames.get(baseName) ?? 0;
    usedNames.set(baseName, seen + 1);
    const dot = baseName.lastIndexOf(".");
    const name =
      seen === 0
        ? baseName
        : dot > 0
          ? `${baseName.slice(0, dot)} (${seen})${baseName.slice(dot)}`
          : `${baseName} (${seen})`;

    folder.file(name, base64, { base64: true });
    added++;
  });

  if (added === 0) throw new Error("لا توجد بيانات ملفات قابلة للتحميل في هذا السجل.");

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${safeFileName(record.title) || "files"}_bundle.zip`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// يمنع زرار Enter جوه أي input من إرسال الفورم كله بالغلط
const blockEnterSubmit = (e: ReactKeyboardEvent<HTMLFormElement>) => {
  if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
};

const onEnter = (action: () => void) => (e: ReactKeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") {
    e.preventDefault();
    action();
  }
};

/* ================================================================== */
/*  UI primitives                                                     */
/* ================================================================== */

const FIELD_BASE = "w-full rounded-xl border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2";

const INPUT = {
  light: `${FIELD_BASE} border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-blue-600/15`,
  lightOnTint: `${FIELD_BASE} border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:ring-blue-600/15`,
  price: `${FIELD_BASE} border-emerald-300 bg-white font-bold text-emerald-700 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/15`,
  readOnly: `${FIELD_BASE} cursor-not-allowed border-slate-200 bg-slate-100 font-bold text-blue-700 placeholder:font-normal placeholder:text-slate-400 focus:ring-transparent`,
  quiz: `${FIELD_BASE} border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:border-purple-600 focus:bg-white focus:ring-purple-600/15`,
  quizOnTint: `${FIELD_BASE} border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-purple-600 focus:ring-purple-600/15`,
  darkVideo: `${FIELD_BASE} border-white/20 bg-slate-900/90 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400/20`,
  darkQuiz: `${FIELD_BASE} border-white/15 bg-slate-800 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-cyan-400/20`,
};

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

const PRIMARY_BASE = `${FOCUS_RING} inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r px-8 py-3.5 text-sm font-bold text-white shadow-xl transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto`;
const SOFT_BASE = `${FOCUS_RING} inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50`;

const BTN = {
  primaryBlue: `${PRIMARY_BASE} from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500`,
  primaryPurple: `${PRIMARY_BASE} from-purple-600 via-indigo-600 to-blue-700 hover:from-purple-500 hover:to-indigo-500`,
  blue: `${SOFT_BASE} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`,
  rose: `${SOFT_BASE} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`,
  slate: `${SOFT_BASE} border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100`,
  cyan: `${FOCUS_RING} inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:from-cyan-400 hover:to-blue-500 active:scale-[0.98]`,
};

const LABEL_TONE = {
  light: "text-slate-700",
  cyan: "text-cyan-200",
  muted: "text-slate-300",
} as const;

function Field({
  label,
  icon,
  tone = "light",
  className,
  children,
}: {
  label: string;
  icon?: ReactNode;
  tone?: keyof typeof LABEL_TONE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cx("block space-y-2", className)}>
      <span className={cx("flex items-center gap-1.5 text-sm font-semibold", LABEL_TONE[tone])}>
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-3xl border border-slate-200/90 bg-white shadow-sm">{children}</section>;
}

function PanelHeader({
  icon,
  iconClass,
  title,
  subtitle,
  editing,
  action,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  subtitle?: string;
  editing?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-8">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", iconClass)}>{icon}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">{title}</h2>
            {editing && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                وضع التعديل
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-bold text-slate-900">{children}</h3>;
}

function CancelEditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={BTN.rose}>
      <X size={14} />
      إلغاء التعديل
    </button>
  );
}

function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className={BTN.slate}>
      <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
      تحديث السجلات
    </button>
  );
}

function EmptyState({ loading, text, iconClass }: { loading: boolean; text: string; iconClass: string }) {
  return (
    <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
      {loading ? (
        <Loader2 size={28} className="animate-spin text-slate-400" />
      ) : (
        <AlertCircle size={32} className={iconClass} />
      )}
      <p className="text-sm font-bold text-slate-700">{loading ? "جاري تحميل السجلات..." : text}</p>
    </div>
  );
}

function RecordActions({
  onEdit,
  onDelete,
  deleting,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="mt-auto flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
      <button type="button" onClick={onEdit} className={BTN.blue}>
        <Edit3 size={15} />
        تعديل
      </button>
      <button type="button" onClick={onDelete} disabled={deleting} className={BTN.rose}>
        {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
        حذف
      </button>
    </div>
  );
}

function SubmitButton({
  saving,
  editing,
  variant,
  createLabel,
  createIcon,
  updateLabel,
}: {
  saving: boolean;
  editing: boolean;
  variant: "primaryBlue" | "primaryPurple";
  createLabel: string;
  createIcon: ReactNode;
  updateLabel: string;
}) {
  return (
    <div className="flex justify-end border-t border-slate-100 pt-6">
      <button type="submit" disabled={saving} className={BTN[variant]}>
        {saving ? <Loader2 size={18} className="animate-spin" /> : editing ? <Save size={18} /> : createIcon}
        {saving ? "جاري الحفظ..." : editing ? updateLabel : createLabel}
      </button>
    </div>
  );
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = name?.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return <FileText size={18} className="shrink-0 text-rose-500" />;
  if (["zip", "rar", "7z"].includes(ext)) return <FileArchive size={18} className="shrink-0 text-amber-500" />;
  if (["xls", "xlsx", "csv"].includes(ext)) return <FileSpreadsheet size={18} className="shrink-0 text-emerald-500" />;
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return <ImageIcon size={18} className="shrink-0 text-indigo-500" />;
  return <FileText size={18} className="shrink-0 text-blue-500" />;
}

function InfoItem({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-bold text-slate-800">{children}</dd>
    </div>
  );
}

/* ================================================================== */
/*  Page                                                              */
/* ================================================================== */

export default function TeacherContentPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("video");
  const [notice, setNotice] = useState<{ id: number; type: NoticeType; text: string } | null>(null);

  const notify = useCallback<Notify>((type, text) => setNotice({ id: Date.now(), type, text }), []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.type === "error" ? 8000 : 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const courses = useRecords("courses", mapCourse, notify, "خطأ في جلب الكورسات");
  const files = useRecords("course_files", mapFileRecord, notify, "خطأ في جلب الملفات");
  const quizzes = useRecords("quizzes", mapQuiz, notify, "خطأ في جلب الاختبارات");

  const counts: Record<TabKey, number> = {
    video: courses.records.length,
    file: files.records.length,
    quiz: quizzes.records.length,
  };

  return (
    <div className="min-h-screen space-y-6 text-slate-800" dir="rtl">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 p-6 text-white shadow-xl sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-0 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative max-w-3xl space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/25 px-3.5 py-1.5 text-xs font-bold backdrop-blur-md">
            <Sparkles size={14} />
            رفع المحتوى والدروس، منصة
            <span dir="ltr" className="tracking-[0.3em]">
              ZED
            </span>
          </span>
          <h1 className="text-2xl font-black leading-tight sm:text-4xl">
            إدارة المناهج، الكورسات، الملفات، والاختبارات الشاملة
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-blue-100 sm:text-base">
            أنشئ الكورسات وأضف محاضراتها، ارفع الملفات والمستندات، وجهّز الاختبارات والواجبات بدرجاتها ومواعيد البدء
            والتسليم.
          </p>
        </div>
      </header>

      <nav role="tablist" aria-label="أقسام المحتوى" className="grid gap-3 sm:grid-cols-3">
        {TABS.map(({ key, title, subtitle, icon: Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(key)}
              className={cx(
                FOCUS_RING,
                "flex items-center gap-3.5 rounded-2xl border-2 p-4 text-right transition-colors",
                active
                  ? "border-blue-600 bg-blue-600 text-white shadow-md"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
              )}
            >
              <span
                className={cx(
                  "grid h-12 w-12 shrink-0 place-items-center rounded-xl",
                  active ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"
                )}
              >
                <Icon size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">{title}</span>
                <span className={cx("block text-xs", active ? "text-blue-100" : "text-slate-400")}>{subtitle}</span>
              </span>
              <span
                className={cx(
                  "rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums",
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                )}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </nav>

      {/* الأقسام بتفضل mounted عشان البيانات اللي بتتكتب متضيعش عند التنقل بين التابات */}
      <div role="tabpanel" hidden={activeTab !== "video"}>
        <CoursesTab {...courses} notify={notify} />
      </div>
      <div role="tabpanel" hidden={activeTab !== "file"}>
        <FilesTab {...files} courses={courses.records} notify={notify} />
      </div>
      <div role="tabpanel" hidden={activeTab !== "quiz"}>
        <QuizzesTab {...quizzes} courses={courses.records} notify={notify} />
      </div>

      {notice && (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:bottom-6">
          <div
            key={notice.id}
            role={notice.type === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-lg items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm font-bold shadow-xl",
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
            )}
          >
            {notice.type === "success" ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600" />
            )}
            <span className="flex-1 leading-relaxed">{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="إغلاق الإشعار"
              className="shrink-0 rounded-lg p-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Tab 1: Courses & videos                                           */
/* ================================================================== */

interface CourseForm {
  courseName: string;
  specialty: string;
  pricing: "free" | "paid";
  price: string;
  status: string;
  showTimes: string;
  description: string;
}

interface VideoDraft {
  title: string;
  source: "url" | "upload";
  url: string;
  file: File | null;
}

const EMPTY_COURSE_FORM: CourseForm = {
  courseName: "",
  specialty: "",
  pricing: "free",
  price: "",
  status: "active",
  showTimes: "",
  description: "",
};

const EMPTY_VIDEO_DRAFT: VideoDraft = { title: "", source: "url", url: "", file: null };

function CoursesTab({ records: courses, loading, reload, remove, notify }: RecordsProps<Course>) {
  const [form, setForm] = useState<CourseForm>(EMPTY_COURSE_FORM);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [draft, setDraft] = useState<VideoDraft>(EMPTY_VIDEO_DRAFT);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [filePreviewUrl, setFilePreviewUrl] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const isEditing = editingId !== null;
  const isPaid = form.pricing === "paid";

  const setField = <K extends keyof CourseForm>(key: K, value: CourseForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setDraftField = <K extends keyof VideoDraft>(key: K, value: VideoDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // معاينة ملف الفيديو المحلي مع تحرير الـ blob URL لتجنب تسريب الذاكرة
  useEffect(() => {
    if (!draft.file) {
      setFilePreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(draft.file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.file]);

  const clearDraft = (keepSource = true) => {
    setDraft((prev) => ({ ...EMPTY_VIDEO_DRAFT, source: keepSource ? prev.source : "url" }));
    setFileInputKey((k) => k + 1);
  };

  const resetForm = () => {
    setForm(EMPTY_COURSE_FORM);
    setVideos([]);
    setEditingId(null);
    clearDraft(false);
  };

  const addVideo = () => {
    const title = draft.title.trim();
    const url = draft.url.trim();
    const isUpload = draft.source === "upload";

    if (!title) return notify("error", "الرجاء إدخال عنوان الفيديو أو المحاضرة.");
    if (!isUpload && !url) return notify("error", "الرجاء إدخال رابط الفيديو الخارجي.");
    if (isUpload && !draft.file) return notify("error", "الرجاء اختيار ملف الفيديو من جهازك.");

    setVideos((prev) => [
      ...prev,
      {
        id: Date.now(),
        title,
        inputType: draft.source,
        mediaUrl: isUpload ? "" : url,
        fileName: draft.file?.name ?? "",
        fileSize: draft.file ? toMB(draft.file.size) : "رابط سحابي مباشر",
        // blob: URLs بتموت بعد إعادة تحميل الصفحة، فمش بنخزنها في قاعدة البيانات
        preview: isUpload ? "" : url,
      },
    ]);
    clearDraft();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const price = Number(form.price);

    if (!form.courseName.trim() || !form.specialty.trim()) {
      return notify("error", "الرجاء إدخال اسم الكورس وتخصص الكورس الأساسي.");
    }
    if (isPaid && !(price > 0)) {
      return notify("error", "الرجاء إدخال سعر أكبر من صفر للكورس المدفوع.");
    }
    if (videos.length === 0) {
      return notify("error", "الرجاء إضافة فيديو واحد على الأقل داخل قائمة المحاضرات.");
    }

    const payload = {
      course_name: form.courseName,
      course_specialty: form.specialty,
      is_free: !isPaid,
      price: isPaid ? price : 0,
      status: form.status,
      show_times: form.showTimes,
      description: form.description,
      video_count: videos.length,
      videos_list: videos,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await updateRow("courses", editingId, payload);
        notify("success", "تم تعديل الكورس وحفظ التحديثات في السجلات بنجاح.");
      } else {
        await insertRow("courses", payload);
        notify("success", `تم حفظ الكورس بـ (${videos.length}) فيديو وإضافته للسجلات بنجاح.`);
      }
      resetForm();
      await reload();
    } catch (err) {
      notify("error", "حدث خطأ أثناء الاتصال بقاعدة البيانات: " + errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (course: Course) => {
    setEditingId(course.id);
    setForm({
      courseName: course.courseName,
      specialty: course.specialty,
      pricing: course.isFree ? "free" : "paid",
      price: course.isFree ? "" : String(course.price || ""),
      status: course.status,
      showTimes: toDateTimeLocal(course.showTimes),
      description: course.courseDesc,
    });
    setVideos(course.videosList);
    clearDraft(false);
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الكورس وجميع تفاصيله؟")) return;
    setDeletingId(id);
    try {
      await deleteRow("courses", id);
      remove(id);
      if (editingId === id) resetForm();
      notify("success", "تم حذف الكورس من السجلات بنجاح.");
    } catch (err) {
      notify("error", "حدث خطأ أثناء الحذف: " + errorMessage(err));
      await reload();
    } finally {
      setDeletingId(null);
    }
  };

  const previewUrl = draft.source === "upload" ? filePreviewUrl : draft.url.trim();
  const youTubeId = draft.source === "url" ? getYouTubeId(previewUrl) : null;
  const canPlayDirectly = draft.source === "upload" || isDirectVideoUrl(previewUrl);

  return (
    <div className="space-y-6">
      <div ref={formTopRef} className="scroll-mt-6">
        <Panel>
          <PanelHeader
            icon={<Video size={22} />}
            iconClass="bg-blue-50 text-blue-600"
            title={isEditing ? `تعديل الكورس رقم ${editingId}` : "إضافة كورس جديد"}
            subtitle="أدخل بيانات الكورس، أضف المحاضرات بالترتيب، ثم احفظ."
            editing={isEditing}
            action={isEditing && <CancelEditButton onClick={resetForm} />}
          />

          <form onSubmit={handleSubmit} onKeyDown={blockEnterSubmit} className="space-y-8 p-6 sm:p-8">
            <div className="space-y-4">
              <SectionTitle>بيانات الكورس</SectionTitle>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="اسم الكورس">
                  <input
                    type="text"
                    placeholder="مثال: دبلومة البرمجة المتقدمة"
                    value={form.courseName}
                    onChange={(e) => setField("courseName", e.target.value)}
                    className={INPUT.light}
                  />
                </Field>
                <Field label="تخصص الكورس">
                  <input
                    type="text"
                    placeholder="مثال: تطوير الويب / الذكاء الاصطناعي"
                    value={form.specialty}
                    onChange={(e) => setField("specialty", e.target.value)}
                    className={INPUT.light}
                  />
                </Field>
                <Field label="وصف أو نبذة عن الكورس" className="md:col-span-2">
                  <textarea
                    rows={3}
                    placeholder="اكتب وصفاً مختصراً يوضح محتوى الكورس"
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                    className={cx(INPUT.light, "resize-y leading-relaxed")}
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-4">
              <SectionTitle>السعر والحالة والموعد</SectionTitle>
              <div
                className={cx(
                  "grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2",
                  isPaid ? "lg:grid-cols-4" : "lg:grid-cols-3"
                )}
              >
                <Field label="تكلفة الكورس" icon={<DollarSign size={15} className="text-blue-600" />}>
                  <select
                    value={form.pricing}
                    onChange={(e) => {
                      const pricing = e.target.value as CourseForm["pricing"];
                      setForm((prev) => ({ ...prev, pricing, price: pricing === "free" ? "" : prev.price }));
                    }}
                    className={INPUT.lightOnTint}
                  >
                    <option value="free">مجاني بالكامل</option>
                    <option value="paid">مدفوع (برسوم اشتراك)</option>
                  </select>
                </Field>

                {isPaid && (
                  <Field label="سعر الكورس" icon={<DollarSign size={15} className="text-emerald-600" />}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="مثال: 299.99"
                      value={form.price}
                      onChange={(e) => setField("price", e.target.value)}
                      className={INPUT.price}
                    />
                  </Field>
                )}

                <Field label="حالة الكورس" icon={<Activity size={15} className="text-blue-600" />}>
                  <select
                    value={form.status}
                    onChange={(e) => setField("status", e.target.value)}
                    className={INPUT.lightOnTint}
                  >
                    <option value="active">نشط ومتاح الآن</option>
                    <option value="upcoming">قريباً (قيد التحضير)</option>
                  </select>
                </Field>

                <Field label="موعد العرض" icon={<Calendar size={15} className="text-blue-600" />}>
                  <input
                    type="datetime-local"
                    value={form.showTimes}
                    onChange={(e) => setField("showTimes", e.target.value)}
                    className={INPUT.lightOnTint}
                  />
                </Field>
              </div>
            </div>

            {/* ------------------------- Videos builder ------------------------- */}
            <div className="space-y-5 rounded-3xl border border-blue-500/30 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 p-5 text-white shadow-2xl sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-blue-400/30 bg-blue-600/30 text-cyan-400">
                    <FileVideo size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-black">المحاضرات والفيديوهات</h3>
                    <p className="text-sm text-slate-300">أضف عنوان المحاضرة ومصدرها، وشاهد المعاينة قبل الإضافة.</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-950/90 px-3.5 py-1.5 text-sm font-bold text-cyan-300">
                  <Layers size={15} />
                  <span className="tabular-nums">{videos.length}</span> فيديو
                </span>
              </div>

              <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 md:grid-cols-12">
                <Field label="عنوان المحاضرة أو الدرس" tone="cyan" className="md:col-span-7">
                  <input
                    type="text"
                    placeholder="مثال: الدرس 1: المدخل والأساسيات"
                    value={draft.title}
                    onChange={(e) => setDraftField("title", e.target.value)}
                    onKeyDown={onEnter(addVideo)}
                    className={INPUT.darkVideo}
                  />
                </Field>

                <div className="space-y-2 md:col-span-5">
                  <span className="block text-sm font-semibold text-cyan-200">مصدر الفيديو</span>
                  <div
                    role="radiogroup"
                    aria-label="مصدر الفيديو"
                    className="grid grid-cols-2 gap-1 rounded-xl border border-white/20 bg-slate-900/90 p-1"
                  >
                    {VIDEO_SOURCES.map(({ value, label, icon: Icon }) => {
                      const active = draft.source === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setDraftField("source", value)}
                          className={cx(
                            "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
                            active ? "bg-blue-600 text-white" : "text-slate-300 hover:text-white"
                          )}
                        >
                          <Icon size={15} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end md:col-span-12">
                  <Field
                    label={draft.source === "url" ? "رابط الفيديو (يوتيوب أو مباشر)" : "ملف الفيديو"}
                    tone="cyan"
                    className="min-w-0 flex-1"
                  >
                    {draft.source === "url" ? (
                      <div className="relative">
                        <LinkIcon
                          size={15}
                          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="url"
                          dir="ltr"
                          placeholder="https://..."
                          value={draft.url}
                          onChange={(e) => setDraftField("url", e.target.value)}
                          onKeyDown={onEnter(addVideo)}
                          className={cx(INPUT.darkVideo, "pr-10 text-left")}
                        />
                      </div>
                    ) : (
                      <input
                        key={fileInputKey}
                        type="file"
                        accept="video/*"
                        onChange={(e) => setDraftField("file", e.target.files?.[0] ?? null)}
                        className="block w-full cursor-pointer rounded-xl border border-white/20 bg-slate-900/90 p-1.5 text-sm text-slate-300 file:ml-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-blue-500"
                      />
                    )}
                  </Field>
                  <button type="button" onClick={addVideo} className={BTN.cyan}>
                    <PlusCircle size={17} />
                    إضافة للقائمة
                  </button>
                </div>
              </div>

              {previewUrl && (
                <div className="space-y-3 rounded-2xl border border-white/15 bg-black/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-cyan-300">
                    <span className="inline-flex items-center gap-1.5">
                      <PlayCircle size={17} />
                      معاينة قبل الإضافة
                    </span>
                    <span className="rounded-lg border border-cyan-500/30 bg-cyan-950 px-2.5 py-0.5 text-xs text-cyan-200">
                      {draft.file ? `حجم الملف: ${toMB(draft.file.size)}` : "رابط خارجي"}
                    </span>
                  </div>
                  <div className="mx-auto aspect-video w-full max-w-xl overflow-hidden rounded-xl border border-white/20 bg-black">
                    {canPlayDirectly ? (
                      <video src={previewUrl} controls className="h-full w-full object-contain" />
                    ) : youTubeId ? (
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${youTubeId}`}
                        title="معاينة الفيديو"
                        allow="accelerometer; encrypted-media; picture-in-picture"
                        allowFullScreen
                        className="h-full w-full"
                      />
                    ) : (
                      <div className="grid h-full place-items-center p-6 text-center">
                        <div className="space-y-2">
                          <p dir="ltr" className="max-w-md truncate text-sm font-bold text-white">
                            {previewUrl}
                          </p>
                          <span className="inline-block rounded-full border border-cyan-500/30 bg-cyan-950 px-3 py-1 text-xs font-bold text-cyan-300">
                            لا تتوفر معاينة لهذا الرابط، وسيُحفظ كما هو
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {videos.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-slate-400">
                  لم تُضف أي محاضرة بعد. المحاضرات ستظهر هنا بترتيب إضافتها.
                </p>
              ) : (
                <div className="space-y-2.5">
                  <h4 className="text-sm font-semibold text-slate-300">المحاضرات المدرجة في هذا الكورس</h4>
                  <ol className="max-h-80 space-y-2 overflow-y-auto pl-1">
                    {videos.map((vid, index) => (
                      <li
                        key={vid.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5 transition-colors hover:bg-white/15"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-500 text-xs font-black text-slate-950">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{vid.title}</p>
                            <div className="mt-1 flex min-w-0 items-center gap-2">
                              <span className="shrink-0 rounded-md border border-cyan-500/30 bg-cyan-950 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                                {vid.inputType === "url" ? "رابط خارجي" : `ملف (${vid.fileSize})`}
                              </span>
                              <span dir="ltr" className="truncate text-xs text-slate-300">
                                {vid.inputType === "url" ? vid.mediaUrl : vid.fileName}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setVideos((prev) => prev.filter((v) => v.id !== vid.id))}
                          aria-label={`حذف ${vid.title}`}
                          title="حذف هذا الفيديو"
                          className="shrink-0 rounded-xl border border-transparent p-2.5 text-rose-400 transition-colors hover:border-rose-500/30 hover:bg-rose-950/80"
                        >
                          <Trash2 size={17} />
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <SubmitButton
              saving={saving}
              editing={isEditing}
              variant="primaryBlue"
              createIcon={<PlusCircle size={18} />}
              createLabel="حفظ الكورس بالكامل وإضافته للسجلات"
              updateLabel="حفظ التعديلات وتحديث السجل"
            />
          </form>
        </Panel>
      </div>

      {/* ------------------------- Courses records ------------------------- */}
      <Panel>
        <PanelHeader
          icon={<BookOpen size={22} />}
          iconClass="border border-blue-100 bg-blue-50 text-blue-600"
          title="سجلات الكورسات المحفوظة"
          subtitle="إدارة الكورسات المرئية"
          action={<RefreshButton onClick={reload} loading={loading} />}
        />
        <div className="p-6 sm:p-8">
          {courses.length === 0 ? (
            <EmptyState
              loading={loading}
              iconClass="text-blue-500"
              text="لا توجد كورسات محفوظة بعد. أضف أول كورس من النموذج بالأعلى."
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {courses.map((course) => {
                const expanded = expandedId === course.id;
                return (
                  <article
                    key={course.id}
                    className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white">
                            {course.specialty}
                          </span>
                          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                            {course.isFree ? "مجاني" : `مدفوع (${course.price})`}
                          </span>
                        </div>
                        <h3 className="text-base font-black text-slate-900">{course.courseName}</h3>
                      </div>
                      <span
                        dir="ltr"
                        className="shrink-0 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600"
                      >
                        ID {course.id}
                      </span>
                    </div>

                    {course.courseDesc && (
                      <p className="line-clamp-3 text-sm leading-relaxed text-slate-600">{course.courseDesc}</p>
                    )}

                    <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
                      <InfoItem label="حالة الكورس">
                        {course.status === "active" ? "نشط ومتاح" : "قريباً"}
                      </InfoItem>
                      <InfoItem label="موعد العرض">{formatDateTime(course.showTimes)}</InfoItem>
                    </dl>

                    <div>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpandedId(expanded ? null : course.id)}
                        className="flex w-full items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        <span className="inline-flex items-center gap-2">
                          <FileVideo size={16} />
                          عرض الفيديوهات ({course.videosList.length})
                        </span>
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {expanded && (
                        <ol className="mt-2 space-y-2">
                          {course.videosList.length === 0 ? (
                            <li className="px-1 text-sm text-slate-400">لا توجد فيديوهات في هذا الكورس.</li>
                          ) : (
                            course.videosList.map((vid, idx) => (
                              <li
                                key={vid.id ?? idx}
                                className="rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm font-bold text-cyan-400"
                              >
                                الدرس {idx + 1}: {vid.title}
                              </li>
                            ))
                          )}
                        </ol>
                      )}
                    </div>

                    <RecordActions
                      onEdit={() => startEdit(course)}
                      onDelete={() => handleDelete(course.id)}
                      deleting={deletingId === course.id}
                    />
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ================================================================== */
/*  Tab 2: Files                                                      */
/* ================================================================== */

interface FileForm {
  courseName: string;
  specialty: string;
  title: string;
  description: string;
}

const EMPTY_FILE_FORM: FileForm = { courseName: "", specialty: "", title: "", description: "" };

function FilesTab({
  records,
  loading,
  reload,
  remove,
  notify,
  courses,
}: RecordsProps<FileRecord> & { courses: Course[] }) {
  const [form, setForm] = useState<FileForm>(EMPTY_FILE_FORM);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<StoredFile[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [zippingId, setZippingId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const formTopRef = useRef<HTMLDivElement>(null);

  const isEditing = editingId !== null;
  const courseMissing = form.courseName !== "" && !courses.some((c) => c.courseName === form.courseName);

  const setField = <K extends keyof FileForm>(key: K, value: FileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const selectCourse = (courseName: string) => {
    const match = courses.find((c) => c.courseName === courseName);
    setForm((prev) => ({ ...prev, courseName, specialty: match?.specialty ?? "" }));
  };

  const handlePickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    // لازم ننسخ الملفات قبل تصفير الـ input لأن FileList بتتمسح معاه
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    setIsDragging(false);
    if (picked.length === 0) return;
    setNewFiles((prev) => {
      const seen = new Set(prev.map(fileKey));
      return [...prev, ...picked.filter((f) => !seen.has(fileKey(f)))];
    });
  };

  const resetForm = () => {
    setForm(EMPTY_FILE_FORM);
    setNewFiles([]);
    setExistingFiles([]);
    setEditingId(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.courseName.trim() || !form.title.trim()) {
      return notify("error", "الرجاء اختيار الكورس وإدخال عنوان مجموعة الملفات.");
    }
    if (newFiles.length + existingFiles.length === 0) {
      return notify("error", "الرجاء اختيار ملف واحد على الأقل للرفع.");
    }

    setSaving(true);
    try {
      const encoded: StoredFile[] = await Promise.all(
        newFiles.map(async (file) => ({
          name: file.name,
          size: toMB(file.size),
          type: file.type || "unknown",
          data: await fileToDataUrl(file),
        }))
      );

      const payload = {
        course_name: form.courseName,
        specialty: form.specialty,
        title: form.title,
        files_info: [...existingFiles, ...encoded],
        description: form.description,
      };

      if (isEditing) {
        await updateRow("course_files", editingId, payload);
        notify("success", "تم تحديث سجل الملفات والمستندات بنجاح.");
      } else {
        await insertRow("course_files", payload);
        notify("success", `تم رفع (${encoded.length}) ملف وتخزينها في قاعدة البيانات بنجاح.`);
      }
      resetForm();
      await reload();
    } catch (err) {
      notify("error", "حدث خطأ أثناء حفظ الملفات: " + errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (record: FileRecord) => {
    setEditingId(record.id);
    setForm({
      courseName: record.courseName,
      specialty: record.specialty,
      title: record.title,
      description: record.description,
    });
    setExistingFiles(record.filesInfo);
    setNewFiles([]);
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف مجموعة الملفات هذه من قاعدة البيانات؟")) return;
    setDeletingId(id);
    try {
      await deleteRow("course_files", id);
      remove(id);
      if (editingId === id) resetForm();
      notify("success", "تم حذف مجموعة الملفات من السجلات بنجاح.");
    } catch (err) {
      notify("error", "خطأ أثناء الحذف: " + errorMessage(err));
      await reload();
    } finally {
      setDeletingId(null);
    }
  };

  const handleZip = async (record: FileRecord) => {
    setZippingId(record.id);
    try {
      await downloadRecordAsZip(record);
    } catch (err) {
      notify("error", "حدث خطأ أثناء إنشاء ملف الـ ZIP: " + errorMessage(err));
    } finally {
      setZippingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div ref={formTopRef} className="scroll-mt-6">
        <Panel>
          <PanelHeader
            icon={<FolderArchive size={22} />}
            iconClass="bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md"
            title={isEditing ? "تعديل مجموعة الملفات والمستندات" : "رفع ملفات جماعي"}
            subtitle="اختر الكورس ليُربط التخصص تلقائياً، ثم اسحب ملفاتك أو اخترها دفعة واحدة."
            editing={isEditing}
            action={isEditing && <CancelEditButton onClick={resetForm} />}
          />

          <form onSubmit={handleSubmit} onKeyDown={blockEnterSubmit} className="space-y-8 p-6 sm:p-8">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="الكورس المرتبط">
                <select
                  value={form.courseName}
                  onChange={(e) => selectCourse(e.target.value)}
                  className={INPUT.light}
                >
                  <option value="">اختر الكورس المطلوب ربطه</option>
                  {courseMissing && <option value={form.courseName}>{form.courseName} (غير موجود حالياً)</option>}
                  {courses.map((course) => (
                    <option key={course.id} value={course.courseName}>
                      [ID: {course.id}] {course.courseName}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="تخصص الكورس (تلقائي)">
                <input
                  type="text"
                  readOnly
                  placeholder="يظهر التخصص بعد اختيار الكورس"
                  value={form.specialty}
                  className={INPUT.readOnly}
                />
              </Field>

              <Field label="عنوان المجموعة">
                <input
                  type="text"
                  placeholder="مثال: حزمة ملخصات الفيزياء"
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  className={INPUT.light}
                />
              </Field>

              <Field label="ملاحظات أو تفاصيل إضافية">
                <input
                  type="text"
                  placeholder="أضف وصفاً توضيحياً للملفات المرفقة"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  className={INPUT.light}
                />
              </Field>
            </div>

            <div className="space-y-4">
              <SectionTitle>الملفات</SectionTitle>

              <div
                className={cx(
                  "relative rounded-3xl border-2 border-dashed p-8 text-center transition-colors focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2",
                  isDragging ? "border-blue-600 bg-blue-50/80" : "border-blue-300 bg-blue-50/40 hover:bg-blue-50/80"
                )}
              >
                <input
                  type="file"
                  multiple
                  aria-label="اختر الملفات للرفع"
                  onChange={handlePickFiles}
                  onDragEnter={() => setIsDragging(true)}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={() => setIsDragging(false)}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                />
                <div className="pointer-events-none space-y-3">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg">
                    <UploadCloud size={28} />
                  </div>
                  <p className="text-sm font-bold text-slate-800">اسحب الملفات هنا، أو انقر للاختيار</p>
                  <p className="text-xs text-slate-500">PDF وWord وExcel وZip والصور، ويمكن اختيار عدة ملفات معاً</p>
                </div>
              </div>

              {isEditing && existingFiles.length > 0 && (
                <div className="space-y-2.5 rounded-2xl bg-blue-950 p-4 text-white">
                  <p className="text-xs font-bold text-cyan-300">
                    الملفات المحفوظة مسبقاً في هذا السجل ({existingFiles.length}). الإزالة تُطبَّق عند حفظ التعديل.
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {existingFiles.map((file, idx) => (
                      <li
                        key={`${file.name}-${idx}`}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-blue-700 bg-blue-900 py-1 pl-1 pr-2.5 text-xs"
                      >
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setExistingFiles((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label={`إزالة ${file.name}`}
                          className="shrink-0 rounded-md p-0.5 text-rose-300 transition-colors hover:bg-rose-950"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {newFiles.length > 0 && (
                <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-5 text-white shadow-xl">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 text-sm">
                    <span className="inline-flex items-center gap-2 font-bold text-cyan-400">
                      <FileCheck size={18} />
                      {newFiles.length} ملف جديد جاهز للرفع
                    </span>
                    <button
                      type="button"
                      onClick={() => setNewFiles([])}
                      className="text-xs font-bold text-rose-400 transition-colors hover:text-rose-300"
                    >
                      حذف الكل
                    </button>
                  </div>
                  <ul className="grid max-h-56 gap-2.5 overflow-y-auto pl-1 sm:grid-cols-2 lg:grid-cols-3">
                    {newFiles.map((file) => (
                      <li
                        key={fileKey(file)}
                        className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/10 p-3 text-xs transition-colors hover:bg-white/15"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <FileTypeIcon name={file.name} />
                          <span className="truncate font-bold text-slate-200">{file.name}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                            {toMB(file.size, 1)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setNewFiles((prev) => prev.filter((f) => fileKey(f) !== fileKey(file)))}
                            aria-label={`إزالة ${file.name}`}
                            className="rounded-lg p-1 text-rose-400 transition-colors hover:bg-rose-950"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <SubmitButton
              saving={saving}
              editing={isEditing}
              variant="primaryBlue"
              createIcon={<UploadCloud size={18} />}
              createLabel="حفظ ورفع الملفات دفعة واحدة"
              updateLabel="تحديث السجل"
            />
          </form>
        </Panel>
      </div>

      {/* ------------------------- Files records ------------------------- */}
      <Panel>
        <PanelHeader
          icon={<BookOpen size={22} />}
          iconClass="border border-indigo-100 bg-indigo-50 text-indigo-600"
          title="سجلات الملفات والمستندات المحفوظة"
          subtitle="تحميل فردي أو جماعي كملف ZIP"
          action={<RefreshButton onClick={reload} loading={loading} />}
        />
        <div className="p-6 sm:p-8">
          {records.length === 0 ? (
            <EmptyState
              loading={loading}
              iconClass="text-blue-500"
              text="لا توجد ملفات أو مستندات مسجلة بعد. ارفع أول مجموعة من النموذج بالأعلى."
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {records.map((record) => (
                <article
                  key={record.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-blue-500"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <span className="inline-block rounded-lg bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white">
                        {record.specialty || "تخصص عام"}
                      </span>
                      <h3 className="text-base font-black text-slate-900">{record.title}</h3>
                    </div>
                    <span className="max-w-[45%] shrink-0 truncate rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                      كورس: {record.courseName}
                    </span>
                  </div>

                  {record.description && (
                    <p className="text-sm leading-relaxed text-slate-600">{record.description}</p>
                  )}

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-400">
                        الملفات المرفقة ({record.filesInfo.length})
                      </span>
                      {record.filesInfo.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleZip(record)}
                          disabled={zippingId === record.id}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          {zippingId === record.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Download size={13} />
                          )}
                          تحميل الكل كملف ZIP
                        </button>
                      )}
                    </div>

                    <ul className="max-h-48 space-y-2 overflow-y-auto pl-1">
                      {record.filesInfo.map((file, idx) => (
                        <li
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <FileTypeIcon name={file.name} />
                            <span className="truncate font-bold text-slate-800">{file.name}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              {file.size}
                            </span>
                            {file.data && (
                              <button
                                type="button"
                                onClick={() => downloadStoredFile(file)}
                                aria-label={`تحميل ${file.name}`}
                                title="تحميل"
                                className="rounded-lg bg-emerald-50 p-1.5 text-emerald-700 transition-colors hover:bg-emerald-100"
                              >
                                <Download size={14} />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <RecordActions
                    onEdit={() => startEdit(record)}
                    onDelete={() => handleDelete(record.id)}
                    deleting={deletingId === record.id}
                  />
                </article>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ================================================================== */
/*  Tab 3: Quizzes & assignments                                      */
/* ================================================================== */

interface QuizSettings {
  courseId: string;
  courseName: string;
  specialty: string;
  startDate: string;
  dueDate: string;
  duration: string;
  attempts: string;
}

interface QuestionDraft {
  text: string;
  type: Question["type"];
  score: string;
  options: string[];
  correct: number[];
  modelAnswer: string;
}

const EMPTY_QUIZ_SETTINGS: QuizSettings = {
  courseId: "",
  courseName: "",
  specialty: "",
  startDate: "",
  dueDate: "",
  duration: "30",
  attempts: "1",
};

const EMPTY_QUESTION: QuestionDraft = {
  text: "",
  type: "mcq",
  score: "5",
  options: ["", ""],
  correct: [],
  modelAnswer: "",
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const totalScore = (questions: Question[]) => questions.reduce((sum, q) => sum + (Number(q.score) || 0), 0);

function QuizzesTab({
  records,
  loading,
  reload,
  remove,
  notify,
  courses,
}: RecordsProps<Quiz> & { courses: Course[] }) {
  const [settings, setSettings] = useState<QuizSettings>(EMPTY_QUIZ_SETTINGS);
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY_QUESTION);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const isEditing = editingId !== null;
  const courseMissing = settings.courseId !== "" && !courses.some((c) => String(c.id) === settings.courseId);
  const durationOptions = QUIZ_DURATIONS.some((d) => d.value === settings.duration)
    ? QUIZ_DURATIONS
    : [...QUIZ_DURATIONS, { value: settings.duration, label: `${settings.duration} دقيقة` }];

  const setSetting = <K extends keyof QuizSettings>(key: K, value: QuizSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const setDraftField = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const selectCourse = (courseId: string) => {
    const match = courses.find((c) => String(c.id) === courseId);
    setSettings((prev) => ({
      ...prev,
      courseId,
      courseName: match?.courseName ?? "",
      specialty: match?.specialty ?? "",
    }));
  };

  const toggleCorrect = (index: number, checked: boolean) =>
    setDraft((prev) => ({
      ...prev,
      correct: checked ? [...prev.correct, index] : prev.correct.filter((i) => i !== index),
    }));

  const updateOption = (index: number, value: string) =>
    setDraft((prev) => ({ ...prev, options: prev.options.map((opt, i) => (i === index ? value : opt)) }));

  const removeOption = (index: number) =>
    setDraft((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
      correct: prev.correct.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
    }));

  const addQuestion = () => {
    const text = draft.text.trim();
    if (!text) return notify("error", "الرجاء كتابة نص السؤال.");

    if (draft.type === "mcq") {
      if (draft.options.some((opt) => !opt.trim())) {
        return notify("error", "الرجاء ملء جميع خيارات الاختيار من متعدد.");
      }
      if (draft.correct.length === 0) {
        return notify("error", "الرجاء تحديد إجابة صحيحة واحدة على الأقل.");
      }
    } else if (!draft.modelAnswer.trim()) {
      return notify("error", "الرجاء كتابة نموذج الإجابة للسؤال المقالي.");
    }

    const isMcq = draft.type === "mcq";
    setQuestions((prev) => [
      ...prev,
      {
        id: Date.now(),
        text,
        type: draft.type,
        score: clamp(Number(draft.score) || 5, 1, 100),
        options: isMcq ? draft.options.map((o) => o.trim()) : [],
        correctAnswers: isMcq ? [...draft.correct].sort((a, b) => a - b) : [],
        modelAnswer: isMcq ? "" : draft.modelAnswer,
      },
    ]);
    setDraft((prev) => ({ ...EMPTY_QUESTION, type: prev.type }));
  };

  const resetForm = () => {
    setSettings(EMPTY_QUIZ_SETTINGS);
    setDraft(EMPTY_QUESTION);
    setQuestions([]);
    setEditingId(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!settings.courseId || !settings.startDate || !settings.dueDate) {
      return notify("error", "الرجاء اختيار الكورس وتحديد موعد البدء وآخر موعد للتسليم.");
    }
    if (new Date(settings.dueDate).getTime() <= new Date(settings.startDate).getTime()) {
      return notify("error", "آخر موعد للتسليم يجب أن يكون بعد موعد بدء الاختبار.");
    }
    if (questions.length === 0) {
      return notify("error", "الرجاء إضافة سؤال واحد على الأقل للاختبار أو الواجب.");
    }

    const payload = {
      course_id: Number(settings.courseId),
      course_name: settings.courseName,
      course_specialty: settings.specialty,
      start_date: settings.startDate,
      due_date: settings.dueDate,
      quiz_duration: settings.duration,
      allowed_attempts: clamp(Number(settings.attempts) || 1, 1, 10),
      questions_list: questions,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await updateRow("quizzes", editingId, payload);
        notify("success", "تم تحديث الاختبار أو الواجب في السجلات بنجاح.");
      } else {
        await insertRow("quizzes", payload);
        notify("success", `تم حفظ الاختبار/الواجب بـ (${questions.length}) سؤال بنجاح.`);
      }
      resetForm();
      await reload();
    } catch (err) {
      notify("error", "حدث خطأ أثناء حفظ الاختبار: " + errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (quiz: Quiz) => {
    setEditingId(quiz.id);
    setSettings({
      courseId: Number.isFinite(quiz.courseId) ? String(quiz.courseId) : "",
      courseName: quiz.courseName,
      specialty: quiz.specialty,
      startDate: toDateTimeLocal(quiz.startDate),
      dueDate: toDateTimeLocal(quiz.dueDate),
      duration: quiz.quizDuration || "30",
      attempts: String(quiz.allowedAttempts || 1),
    });
    setQuestions(quiz.questions);
    setDraft(EMPTY_QUESTION);
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الاختبار أو الواجب نهائياً؟")) return;
    setDeletingId(id);
    try {
      await deleteRow("quizzes", id);
      remove(id);
      if (editingId === id) resetForm();
      notify("success", "تم حذف الاختبار أو الواجب من السجلات بنجاح.");
    } catch (err) {
      notify("error", "خطأ أثناء الحذف: " + errorMessage(err));
      await reload();
    } finally {
      setDeletingId(null);
    }
  };

  const draftTotal = totalScore(questions);

  return (
    <div className="space-y-6">
      <div ref={formTopRef} className="scroll-mt-6">
        <Panel>
          <PanelHeader
            icon={<CheckSquare size={22} />}
            iconClass="bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-md"
            title={isEditing ? "تعديل الاختبار أو الواجب" : "إنشاء اختبار أو واجب"}
            subtitle="اربط الاختبار بالكورس، حدد المواعيد والمدة، ثم أضف الأسئلة."
            editing={isEditing}
            action={isEditing && <CancelEditButton onClick={resetForm} />}
          />

          <form onSubmit={handleSubmit} onKeyDown={blockEnterSubmit} className="space-y-8 p-6 sm:p-8">
            <Field label="الكورس المرتبط">
              <select
                value={settings.courseId}
                onChange={(e) => selectCourse(e.target.value)}
                className={INPUT.quiz}
              >
                <option value="">اختر الكورس</option>
                {courseMissing && (
                  <option value={settings.courseId}>
                    [ID: {settings.courseId}] {settings.courseName} (غير موجود حالياً)
                  </option>
                )}
                {courses.map((course) => (
                  <option key={course.id} value={String(course.id)}>
                    [ID: {course.id}] {course.courseName} ({course.specialty})
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 rounded-2xl border border-purple-100 bg-purple-50/50 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
              <Field label="موعد بدء الاختبار" icon={<Clock size={15} className="text-purple-600" />}>
                <input
                  type="datetime-local"
                  value={settings.startDate}
                  onChange={(e) => setSetting("startDate", e.target.value)}
                  className={INPUT.quizOnTint}
                />
              </Field>
              <Field label="آخر موعد للتسليم" icon={<Calendar size={15} className="text-purple-600" />}>
                <input
                  type="datetime-local"
                  value={settings.dueDate}
                  min={settings.startDate || undefined}
                  onChange={(e) => setSetting("dueDate", e.target.value)}
                  className={INPUT.quizOnTint}
                />
              </Field>
              <Field label="مدة الامتحان" icon={<Sparkles size={15} className="text-purple-600" />}>
                <select
                  value={settings.duration}
                  onChange={(e) => setSetting("duration", e.target.value)}
                  className={INPUT.quizOnTint}
                >
                  {durationOptions.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="عدد المحاولات" icon={<Activity size={15} className="text-purple-600" />}>
                <input
                  type="number"
                  min="1"
                  max="10"
                  inputMode="numeric"
                  value={settings.attempts}
                  onChange={(e) => setSetting("attempts", e.target.value)}
                  className={INPUT.quizOnTint}
                />
              </Field>
            </div>

            {/* ------------------------- Question builder ------------------------- */}
            <div className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-5 text-white shadow-xl sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <h3 className="inline-flex items-center gap-2 text-base font-black text-cyan-300">
                  <HelpCircle size={20} />
                  إضافة سؤال جديد
                </h3>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-lg border border-cyan-500/30 bg-cyan-950 px-2.5 py-1 text-cyan-300">
                    {countLabel(questions.length, QUESTION_WORDS)}
                  </span>
                  <span className="rounded-lg border border-purple-500/30 bg-purple-950 px-2.5 py-1 text-purple-300">
                    المجموع: {countLabel(draftTotal, SCORE_WORDS)}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-12">
                <Field label="نص السؤال" tone="muted" className="md:col-span-6">
                  <input
                    type="text"
                    placeholder="اكتب السؤال هنا"
                    value={draft.text}
                    onChange={(e) => setDraftField("text", e.target.value)}
                    className={INPUT.darkQuiz}
                  />
                </Field>
                <Field label="نوع السؤال" tone="muted" className="md:col-span-3">
                  <select
                    value={draft.type}
                    onChange={(e) => setDraftField("type", e.target.value as Question["type"])}
                    className={INPUT.darkQuiz}
                  >
                    <option value="mcq">اختيار من متعدد (MCQ)</option>
                    <option value="essay">سؤال مقالي مع نموذج إجابة</option>
                  </select>
                </Field>
                <Field label="درجة السؤال" tone="muted" className="md:col-span-3">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    inputMode="numeric"
                    value={draft.score}
                    onChange={(e) => setDraftField("score", e.target.value)}
                    className={INPUT.darkQuiz}
                  />
                </Field>
              </div>

              {draft.type === "mcq" ? (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-cyan-200">
                      الخيارات (علّم الإجابة الصحيحة، ويمكن اختيار أكثر من إجابة)
                    </span>
                    <button
                      type="button"
                      onClick={() => setDraftField("options", [...draft.options, ""])}
                      className="inline-flex items-center gap-1 text-sm font-bold text-cyan-400 transition-colors hover:text-cyan-300"
                    >
                      <PlusCircle size={15} />
                      إضافة خيار
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {draft.options.map((opt, idx) => (
                      <li key={idx} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={draft.correct.includes(idx)}
                          onChange={(e) => toggleCorrect(idx, e.target.checked)}
                          aria-label={`اجعل الخيار ${idx + 1} إجابة صحيحة`}
                          title="اجعل هذا الخيار إجابة صحيحة"
                          className="h-5 w-5 shrink-0 cursor-pointer accent-cyan-500"
                        />
                        <input
                          type="text"
                          placeholder={`الخيار ${idx + 1}`}
                          value={opt}
                          onChange={(e) => updateOption(idx, e.target.value)}
                          className={cx(INPUT.darkQuiz, "py-2.5")}
                        />
                        {draft.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOption(idx)}
                            aria-label={`حذف الخيار ${idx + 1}`}
                            className="shrink-0 rounded-lg p-1.5 text-rose-400 transition-colors hover:bg-rose-950"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <Field label="نموذج الإجابة للسؤال المقالي" tone="cyan">
                    <textarea
                      rows={3}
                      placeholder="اكتب الإجابة النموذجية أو إرشادات التصحيح"
                      value={draft.modelAnswer}
                      onChange={(e) => setDraftField("modelAnswer", e.target.value)}
                      className={cx(INPUT.darkQuiz, "resize-y leading-relaxed")}
                    />
                  </Field>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addQuestion}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-6 py-3 text-sm font-black text-slate-950 shadow-md transition hover:bg-cyan-400 active:scale-[0.98]"
                >
                  <PlusCircle size={16} />
                  إضافة السؤال للاختبار
                </button>
              </div>

              {questions.length > 0 && (
                <div className="space-y-2.5 border-t border-white/10 pt-4">
                  <h4 className="text-sm font-semibold text-slate-300">الأسئلة الجاهزة في هذا الاختبار</h4>
                  <ol className="space-y-2">
                    {questions.map((q, qIndex) => (
                      <li
                        key={q.id}
                        className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/10 p-3.5"
                      >
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-md bg-cyan-500 px-2 py-0.5 font-black text-slate-950">
                              سؤال {qIndex + 1}
                            </span>
                            <span className="font-bold text-cyan-300">{countLabel(q.score, SCORE_WORDS)}</span>
                            <span className="rounded-md border border-purple-500/30 bg-purple-950 px-2 py-0.5 text-purple-300">
                              {q.type === "mcq" ? "اختيار من متعدد" : "سؤال مقالي"}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-white">{q.text}</p>
                          {q.type === "mcq" ? (
                            <ul className="flex flex-wrap gap-1.5">
                              {q.options.map((opt, i) => {
                                const correct = q.correctAnswers?.includes(i);
                                return (
                                  <li
                                    key={i}
                                    className={cx(
                                      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
                                      correct
                                        ? "border-cyan-500/30 bg-cyan-950 text-cyan-300"
                                        : "border-white/10 text-slate-300"
                                    )}
                                  >
                                    {correct && <CheckCircle2 size={12} />}
                                    {opt}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            q.modelAnswer && <p className="line-clamp-2 text-xs text-slate-300">{q.modelAnswer}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setQuestions((prev) => prev.filter((item) => item.id !== q.id))}
                          aria-label={`حذف السؤال ${qIndex + 1}`}
                          className="shrink-0 rounded-xl p-2 text-rose-400 transition-colors hover:bg-rose-950"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <SubmitButton
              saving={saving}
              editing={isEditing}
              variant="primaryPurple"
              createIcon={<PlusCircle size={18} />}
              createLabel="حفظ ونشر الاختبار / الواجب"
              updateLabel="تحديث الاختبار في السجلات"
            />
          </form>
        </Panel>
      </div>

      {/* ------------------------- Quizzes records ------------------------- */}
      <Panel>
        <PanelHeader
          icon={<CheckSquare size={22} />}
          iconClass="border border-purple-100 bg-purple-50 text-purple-600"
          title="سجلات الاختبارات والواجبات المحفوظة"
          subtitle="إدارة وتعديل وحذف الاختبارات المرتبطة بالكورسات"
          action={<RefreshButton onClick={reload} loading={loading} />}
        />
        <div className="p-6 sm:p-8">
          {records.length === 0 ? (
            <EmptyState
              loading={loading}
              iconClass="text-purple-500"
              text="لا توجد اختبارات أو واجبات مسجلة بعد. أنشئ أول اختبار من النموذج بالأعلى."
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {records.map((quiz) => (
                <article
                  key={quiz.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-purple-500"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <span className="inline-block rounded-lg bg-purple-600 px-2.5 py-0.5 text-xs font-bold text-white">
                        {quiz.specialty || "تخصص عام"}
                      </span>
                      <h3 className="text-base font-black text-slate-900">اختبار كورس: {quiz.courseName}</h3>
                    </div>
                    <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                      معرف الكورس: {quiz.courseId}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm sm:grid-cols-3">
                    <InfoItem label="عدد الأسئلة">{countLabel(quiz.questions.length, QUESTION_WORDS)}</InfoItem>
                    <InfoItem label="مجموع الدرجات">{countLabel(totalScore(quiz.questions), SCORE_WORDS)}</InfoItem>
                    <InfoItem label="مدة الامتحان">
                      <span className="text-purple-600">
                        {quiz.quizDuration ? `${quiz.quizDuration} دقيقة` : "غير محدد"}
                      </span>
                    </InfoItem>
                    <InfoItem label="عدد المحاولات">
                      <span className="text-purple-600">{countLabel(quiz.allowedAttempts, ATTEMPT_WORDS)}</span>
                    </InfoItem>
                    <InfoItem label="البدء">{formatDateTime(quiz.startDate)}</InfoItem>
                    <InfoItem label="آخر موعد للتسليم">{formatDateTime(quiz.dueDate)}</InfoItem>
                  </dl>

                  <RecordActions
                    onEdit={() => startEdit(quiz)}
                    onDelete={() => handleDelete(quiz.id)}
                    deleting={deletingId === quiz.id}
                  />
                </article>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}