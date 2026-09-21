import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Camera,
  Check,
  CreditCard,
  Edit3,
  Eye,
  FileText,
  History,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

/* ================================================================== */
/*  Types & constants                                                 */
/* ================================================================== */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type NoticeType = "success" | "error";
type ImageField = "profile_image_url" | "id_front_url" | "id_back_url";
type PageStatus = "loading" | "ready" | "no-user" | "error";

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  city: string;
  bio: string;
  vodafone_cash_number: string;
  instapay_username: string;
}

type RecordForm = Pick<ProfileForm, "name" | "phone" | "city" | "vodafone_cash_number" | "instapay_username">;

const TABLE = "teachers_profile";
const BUCKET = "teachers_documents";
const DEFAULT_ROLE = "مدرس خبير";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const LOCALE = "ar-EG-u-nu-latn";

const IMAGE_SLOTS: Record<ImageField, { folder: string; success: string; previewTitle: string }> = {
  profile_image_url: {
    folder: "profiles",
    success: "تم تحديث الصورة الشخصية وحفظها بنجاح!",
    previewTitle: "معاينة الصورة الشخصية",
  },
  id_front_url: {
    folder: "ids",
    success: "تم رفع وتحديث صورة وجه البطاقة في السجلات!",
    previewTitle: "معاينة وجه البطاقة",
  },
  id_back_url: {
    folder: "ids",
    success: "تم رفع وتحديث صورة ظهر البطاقة في السجلات!",
    previewTitle: "معاينة ظهر البطاقة",
  },
};

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
};

// تحويل الأرقام العربية/الفارسية لأرقام إنجليزية عشان التحقق والحفظ يبقوا موحدين
const toLatinDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

const cleanNumber = (value: string) => toLatinDigits(value).replace(/[\s-]/g, "");

const toForm = (row: Row | null, fallbackEmail: string): ProfileForm => ({
  name: row?.name || "",
  email: row?.email || fallbackEmail,
  phone: row?.phone || "",
  city: row?.city || "",
  bio: row?.bio || "",
  vodafone_cash_number: row?.vodafone_cash_number || "",
  instapay_username: row?.instapay_username || "",
});

const normalizeForm = <T extends Partial<ProfileForm>>(form: T): T => {
  const out = { ...form };
  for (const key of Object.keys(out) as Array<keyof T>) {
    if (typeof out[key] === "string") out[key] = (out[key] as string).trim() as T[keyof T];
  }
  if (out.phone !== undefined) out.phone = cleanNumber(out.phone);
  if (out.vodafone_cash_number !== undefined) out.vodafone_cash_number = cleanNumber(out.vodafone_cash_number);
  return out;
};

const validateForm = (form: Partial<ProfileForm>): string | null => {
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "البريد الإلكتروني غير صحيح.";
  if (form.phone && !/^\+?\d{8,15}$/.test(form.phone)) return "رقم الهاتف غير صحيح.";
  if (form.vodafone_cash_number && !/^01\d{9}$/.test(form.vodafone_cash_number)) {
    return "رقم فودافون كاش يجب أن يتكون من 11 رقماً ويبدأ بـ 01.";
  }
  return null;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const t = Date.parse(String(value).replace(" ", "T"));
  return Number.isNaN(t) ? "" : new Date(t).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });
};

const passwordErrorMessage = (err: unknown) => {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  const message = errorMessage(err);
  if (code === "same_password") return "كلمة المرور الجديدة يجب أن تختلف عن الحالية.";
  if (code === "weak_password") return "كلمة المرور ضعيفة. استخدم حروفاً وأرقاماً ورموزاً.";
  if (code === "reauthentication_needed") return "لأسباب أمنية، سجّل الخروج ثم الدخول مرة أخرى وأعد المحاولة.";
  if (/session/i.test(message)) return "يجب تسجيل الدخول لتغيير كلمة المرور.";
  return "تعذّر تغيير كلمة المرور: " + message;
};

/* ================================================================== */
/*  Data layer (Supabase)                                             */
/* ================================================================== */

async function fetchProfile(userId: string): Promise<Row | null> {
  const { data, error } = await supabase.from(TABLE).select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// upsert بيحدّث الأعمدة المبعوتة بس، والأعمدة التانية (زي address وinstagram) بتفضل زي ما هي
async function upsertProfile(userId: string, patch: Row): Promise<Row> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("لم يتم حفظ البيانات. غالباً صلاحيات RLS في Supabase تمنع العملية.");
  return data;
}

async function updateProfile(userId: string, patch: Row): Promise<Row> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("لم يتم تعديل السجل. غالباً صلاحيات RLS تمنع التعديل، أو السجل غير موجود.");
  return data;
}

async function deleteProfile(userId: string) {
  const { data, error } = await supabase.from(TABLE).delete().eq("user_id", userId).select("user_id");
  if (error) throw error;
  if (!data?.length) throw new Error("لم يتم حذف السجل. غالباً صلاحيات RLS في Supabase تمنع الحذف.");
}

async function uploadImage(userId: string, file: File, folder: string) {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

/* ================================================================== */
/*  UI primitives                                                     */
/* ================================================================== */

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

const INPUT =
  "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 transition-colors focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/15 disabled:cursor-default disabled:border-transparent disabled:text-slate-700";

const SMALL_INPUT =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/15";

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="block text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8", className)}>
      {children}
    </section>
  );
}

function PanelHeader({
  icon,
  title,
  subtitle,
  aside,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">{icon}</div>
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {aside}
    </div>
  );
}

function Modal({
  title,
  icon,
  onClose,
  children,
  className,
  overlayClassName = "bg-black/70 backdrop-blur-xs",
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
}) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // الإغلاق بزرار Escape ومنع سكرول الصفحة ورا المودال
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className={cx("fixed inset-0 z-50 flex items-center justify-center p-4", overlayClassName)}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx("w-full space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8", className)}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 id={titleId} className="flex items-center gap-2 text-base font-black text-slate-900">
            {icon}
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-full text-slate-400 transition-colors hover:text-slate-700"
          >
            <XCircle size={24} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function IdCardSlot({
  label,
  uploadLabel,
  src,
  uploading,
  disabled,
  onPick,
  onPreview,
}: {
  label: string;
  uploadLabel: string;
  src: string | null;
  uploading: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onPreview: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = () => inputRef.current?.click();

  return (
    <div className="flex flex-col gap-4 rounded-3xl border-2 border-dashed border-indigo-200 bg-indigo-50/10 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-700">{label}</span>
        {src && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
            <Check size={12} />
            تم الرفع
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={src ? onPreview : pick}
        disabled={uploading || (!src && disabled)}
        aria-label={src ? `معاينة ${label}` : uploadLabel}
        className={cx(
          FOCUS_RING,
          "relative grid aspect-[8/5] w-full place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
        )}
      >
        {src ? (
          <>
            <img src={src} alt={label} className="h-full w-full object-cover" />
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-xl bg-white/90 px-2.5 py-1 text-xs font-bold text-slate-900 shadow-lg">
              <Eye size={14} />
              معاينة
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2">
            <Upload size={32} className="text-indigo-400" />
            <span className="text-xs text-slate-500">لم يتم رفع صورة بعد</span>
          </span>
        )}
        {uploading && (
          <span className="absolute inset-0 grid place-items-center bg-white/70">
            <Loader2 size={28} className="animate-spin text-indigo-600" />
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // عشان اختيار نفس الملف تاني يشتغل
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        onClick={pick}
        disabled={uploading || disabled}
        className={cx(
          FOCUS_RING,
          "inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-indigo-700 disabled:opacity-60"
        )}
      >
        {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
        {uploading ? "جاري الرفع..." : uploadLabel}
      </button>
    </div>
  );
}

/* ================================================================== */
/*  Page                                                              */
/* ================================================================== */

export default function TeacherProfilePage({ userId: userIdProp }: { userId?: string }) {
  const [status, setStatus] = useState<PageStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");

  const [savedRecord, setSavedRecord] = useState<Row | null>(null);
  const [form, setForm] = useState<ProfileForm>(() => toForm(null, ""));
  const [snapshot, setSnapshot] = useState<ProfileForm>(() => toForm(null, ""));
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<ImageField | null>(null);

  const [recordEditing, setRecordEditing] = useState(false);
  const [recordForm, setRecordForm] = useState<RecordForm>({
    name: "",
    phone: "",
    city: "",
    vodafone_cash_number: "",
    instapay_username: "",
  });
  const [recordBusy, setRecordBusy] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
  const [notice, setNotice] = useState<{ id: number; type: NoticeType; text: string } | null>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);

  const isDirty = isEditing && JSON.stringify(form) !== JSON.stringify(snapshot);
  const profileImage: string | null = savedRecord?.profile_image_url || null;
  const idFrontImage: string | null = savedRecord?.id_front_url || null;
  const idBackImage: string | null = savedRecord?.id_back_url || null;
  const role: string = savedRecord?.role || DEFAULT_ROLE;
  const records = savedRecord ? [savedRecord] : [];

  const notify = useCallback((type: NoticeType, text: string) => setNotice({ id: Date.now(), type, text }), []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.type === "error" ? 8000 : 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // تحذير قبل مغادرة الصفحة لو فيه تعديلات مش محفوظة
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const applyRecord = useCallback((row: Row | null, fallbackEmail: string) => {
    const next = toForm(row, fallbackEmail);
    setSavedRecord(row);
    setForm(next);
    setSnapshot(next);
  }, []);

  /* ---------- تحميل البيانات ---------- */

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      // بدل الـ ID الوهمي المشترك: كل معلم بيقرا ويكتب في السجل بتاعه هو بس
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? "";
      const id = userIdProp ?? data.user?.id ?? null;
      setAuthEmail(email);
      setUserId(id);
      if (!id) {
        setStatus("no-user");
        return;
      }
      applyRecord(await fetchProfile(id), email);
      setStatus("ready");
    } catch (err) {
      console.error("خطأ في تحميل بيانات الملف الشخصي:", err);
      setLoadError(errorMessage(err));
      setStatus("error");
    }
  }, [userIdProp, applyRecord]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- الملف الأساسي ---------- */

  const setField = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const startEditing = () => {
    setRecordEditing(false);
    setSnapshot(form);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setForm(snapshot); // إلغاء التعديل بيرجّع القيم القديمة فعلاً
    setIsEditing(false);
  };

  const handleSaveAll = async () => {
    if (!userId) return;
    const clean = normalizeForm(form);
    const invalid = validateForm(clean);
    if (invalid) return notify("error", invalid);

    setSaving(true);
    try {
      const row = await upsertProfile(userId, clean);
      applyRecord(row, authEmail);
      setIsEditing(false);
      notify("success", "تم حفظ كل بيانات الصفحة والسجلات بنجاح في قاعدة البيانات!");
    } catch (err) {
      notify("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  /* ---------- الصور ---------- */

  const handleImageUpload = async (field: ImageField, file: File) => {
    if (!userId) return;
    if (!file.type.startsWith("image/")) return notify("error", "الرجاء اختيار ملف صورة.");
    if (file.size > MAX_IMAGE_BYTES) return notify("error", "حجم الصورة كبير. الحد الأقصى 10 ميجابايت.");

    setUploadingField(field);
    let uploadedPath: string | null = null;
    try {
      const { path, publicUrl } = await uploadImage(userId, file, IMAGE_SLOTS[field].folder);
      uploadedPath = path;
      const row = await upsertProfile(userId, { [field]: publicUrl });
      setSavedRecord(row);
      notify("success", IMAGE_SLOTS[field].success);
    } catch (err) {
      // لو الحفظ في الجدول فشل، نمسح الملف اللي اترفع عشان ميفضلش ملف يتيم في الـ Storage
      if (uploadedPath) void supabase.storage.from(BUCKET).remove([uploadedPath]);
      notify("error", errorMessage(err));
    } finally {
      setUploadingField(null);
    }
  };

  /* ---------- سجل البيانات المحفوظة ---------- */

  const startRecordEdit = () => {
    if (!savedRecord) return;
    setRecordForm({
      name: savedRecord.name || "",
      phone: savedRecord.phone || "",
      city: savedRecord.city || "",
      vodafone_cash_number: savedRecord.vodafone_cash_number || "",
      instapay_username: savedRecord.instapay_username || "",
    });
    setRecordEditing(true);
  };

  const handleUpdateRecord = async () => {
    if (!userId) return;
    const clean = normalizeForm(recordForm);
    const invalid = validateForm(clean);
    if (invalid) return notify("error", invalid);

    setRecordBusy(true);
    try {
      const row = await updateProfile(userId, clean);
      applyRecord(row, authEmail);
      setRecordEditing(false);
      notify("success", "تم تعديل السجل بنجاح!");
    } catch (err) {
      notify("error", errorMessage(err));
    } finally {
      setRecordBusy(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!userId) return;
    const confirmed = window.confirm(
      "سيتم حذف ملفك الشخصي بالكامل من قاعدة البيانات (الاسم، بيانات الدفع، وروابط صور البطاقة). لا يمكن التراجع عن هذه الخطوة. هل تريد المتابعة؟"
    );
    if (!confirmed) return;

    setRecordBusy(true);
    try {
      await deleteProfile(userId);
      applyRecord(null, authEmail);
      setIsEditing(false);
      setRecordEditing(false);
      notify("success", "تم حذف السجل نهائياً من قاعدة البيانات!");
    } catch (err) {
      notify("error", errorMessage(err));
    } finally {
      setRecordBusy(false);
    }
  };

  /* ---------- كلمة المرور ---------- */

  const closePasswordModal = useCallback(() => {
    setPasswordOpen(false);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  }, []);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    if (newPassword.length < 8) return setPasswordError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
    if (newPassword !== confirmPassword) return setPasswordError("كلمة المرور غير متطابقة.");

    setChangingPassword(true);
    // الكود القديم كان بيعرض "تم التحديث" من غير ما يغيّر حاجة؛ هنا التغيير بيحصل فعلاً في Supabase Auth
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);

    if (error) return setPasswordError(passwordErrorMessage(error));
    closePasswordModal();
    notify("success", "تم تحديث كلمة المرور بنجاح!");
  };

  /* ---------- الحالات الخاصة ---------- */

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 font-bold text-indigo-600" dir="rtl">
        <Loader2 size={36} className="animate-spin" />
      </div>
    );
  }

  if (status === "no-user" || status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" dir="rtl">
        <Panel className="max-w-md space-y-4 text-center">
          <AlertTriangle size={36} className="mx-auto text-rose-600" />
          <h1 className="text-lg font-black text-slate-900">
            {status === "no-user" ? "يجب تسجيل الدخول لعرض ملفك الشخصي" : "خطأ في تحميل بيانات الملف الشخصي."}
          </h1>
          {status === "error" && <p className="text-sm text-slate-500">{loadError}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            {status === "error" && (
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
              >
                إعادة المحاولة
              </button>
            )}
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200"
            >
              <ArrowRight size={16} />
              الصفحة الرئيسية
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  /* ---------- الصفحة ---------- */

  const busy = saving || uploadingField !== null || recordBusy;

  return (
    <div className={cx("min-h-screen space-y-6 text-slate-800", isEditing && "pb-28")} dir="rtl">
      {/* ------------------------------ Banner ------------------------------ */}
      <header className="relative overflow-hidden rounded-[2.5rem] border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 p-6 text-white shadow-2xl sm:p-10">
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-right">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => profileImage && setPreview({ src: profileImage, title: IMAGE_SLOTS.profile_image_url.previewTitle })}
                disabled={!profileImage}
                aria-label="معاينة الصورة الشخصية"
                className="block h-28 w-28 overflow-hidden rounded-3xl bg-gradient-to-tr from-indigo-600 to-blue-400 p-1 shadow-2xl disabled:cursor-default"
              >
                {profileImage ? (
                  <img src={profileImage} alt="الصورة الشخصية" className="h-full w-full rounded-[22px] object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center rounded-[22px] bg-slate-800 text-4xl">
                    👨‍🏫
                  </span>
                )}
                {uploadingField === "profile_image_url" && (
                  <span className="absolute inset-1 grid place-items-center rounded-[22px] bg-slate-900/60">
                    <Loader2 size={26} className="animate-spin" />
                  </span>
                )}
              </button>
              <input
                ref={profileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleImageUpload("profile_image_url", file);
                }}
              />
              <button
                type="button"
                onClick={() => profileInputRef.current?.click()}
                disabled={uploadingField !== null}
                aria-label="تغيير الصورة الشخصية"
                className="absolute -bottom-1 -left-1 rounded-2xl bg-indigo-600 p-2.5 text-white shadow-lg transition-colors hover:bg-indigo-500 disabled:opacity-60"
              >
                <Camera size={16} />
              </button>
            </div>

            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3.5 py-1 text-xs font-bold text-indigo-200 backdrop-blur-md">
                <Sparkles size={13} />
                ملف المعلم النشط
              </span>
              <h1 className="text-3xl font-black tracking-tight">{savedRecord?.name || "أضف اسمك الشخصي"}</h1>
              <p className="text-sm font-medium text-indigo-200">
                {role}
                {savedRecord?.email || authEmail ? (
                  <>
                    {" "}
                    • <span dir="ltr">{savedRecord?.email || authEmail}</span>
                  </>
                ) : null}
              </p>
              {savedRecord?.updated_at && (
                <p className="text-xs text-indigo-200/70">آخر تحديث: {formatDateTime(savedRecord.updated_at)}</p>
              )}
            </div>
          </div>

          <Link
            to="/"
            className={cx(
              FOCUS_RING,
              "inline-flex items-center gap-2 self-start rounded-2xl bg-white px-6 py-3 text-sm font-black text-slate-900 shadow-lg transition-colors hover:bg-indigo-50 md:self-auto"
            )}
          >
            <ArrowRight size={16} />
            الصفحة الرئيسية
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* ------------------------------ Main column ------------------------------ */}
        <div className="space-y-6 lg:col-span-2">
          <Panel>
            <PanelHeader
              icon={<Briefcase size={22} />}
              title="الملف المهني الشخصي"
              subtitle="قم بتحديث بياناتك الأساسية."
              aside={
                <button
                  type="button"
                  onClick={isEditing ? cancelEditing : startEditing}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-60"
                >
                  {isEditing ? <X size={15} /> : <Edit3 size={15} />}
                  {isEditing ? "إلغاء التعديل" : "تعديل البيانات"}
                </button>
              }
            />
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="الاسم الكامل">
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={form.name}
                    placeholder="غير محدد"
                    autoComplete="name"
                    onChange={(e) => setField("name", e.target.value)}
                    className={INPUT}
                  />
                </Field>
                <Field label="البريد الإلكتروني">
                  <input
                    type="email"
                    dir="ltr"
                    disabled={!isEditing}
                    value={form.email}
                    placeholder="name@example.com"
                    autoComplete="email"
                    onChange={(e) => setField("email", e.target.value)}
                    className={cx(INPUT, "text-right")}
                  />
                </Field>
                <Field label="رقم الهاتف">
                  <input
                    type="tel"
                    dir="ltr"
                    inputMode="tel"
                    disabled={!isEditing}
                    value={form.phone}
                    placeholder="01xxxxxxxxx"
                    autoComplete="tel"
                    onChange={(e) => setField("phone", e.target.value)}
                    className={cx(INPUT, "text-right")}
                  />
                </Field>
                <Field label="المدينة / العنوان">
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={form.city}
                    placeholder="غير محدد"
                    onChange={(e) => setField("city", e.target.value)}
                    className={INPUT}
                  />
                </Field>
              </div>
              <Field label="نبذة تعريفية">
                <textarea
                  rows={4}
                  disabled={!isEditing}
                  value={form.bio}
                  placeholder="اكتب نبذة قصيرة عن خبرتك وتخصصك"
                  onChange={(e) => setField("bio", e.target.value)}
                  className={cx(INPUT, "resize-y leading-relaxed disabled:resize-none")}
                />
              </Field>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              icon={<CreditCard size={22} />}
              title="وسائل الدفع والتحصيل"
              subtitle="أدخل حسابات فودافون كاش وإنستا باي الخاصة بك."
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="رقم فودافون كاش">
                <input
                  type="tel"
                  dir="ltr"
                  inputMode="numeric"
                  disabled={!isEditing}
                  value={form.vodafone_cash_number}
                  placeholder="010xxxxxxxx"
                  onChange={(e) => setField("vodafone_cash_number", e.target.value)}
                  className={cx(INPUT, "text-right")}
                />
              </Field>
              <Field label="عنوان انستا باي (Instapay Username)">
                <input
                  type="text"
                  dir="ltr"
                  disabled={!isEditing}
                  value={form.instapay_username}
                  placeholder="username@instapay"
                  onChange={(e) => setField("instapay_username", e.target.value)}
                  className={cx(INPUT, "text-right")}
                />
              </Field>
            </div>
            {!isEditing && (
              <p className="mt-4 text-xs text-slate-400">لتغيير هذه البيانات اضغط «تعديل البيانات» في القسم السابق.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              icon={<FileText size={22} />}
              title="صور البطاقة الشخصية (وجه وظهر)"
              subtitle="تُحفظ الصورة مباشرة بعد رفعها."
            />
            <div className="grid gap-5 md:grid-cols-2">
              <IdCardSlot
                label="وجه البطاقة"
                uploadLabel="رفع وجه البطاقة"
                src={idFrontImage}
                uploading={uploadingField === "id_front_url"}
                disabled={uploadingField !== null}
                onPick={(file) => void handleImageUpload("id_front_url", file)}
                onPreview={() => idFrontImage && setPreview({ src: idFrontImage, title: IMAGE_SLOTS.id_front_url.previewTitle })}
              />
              <IdCardSlot
                label="ظهر البطاقة"
                uploadLabel="رفع ظهر البطاقة"
                src={idBackImage}
                uploading={uploadingField === "id_back_url"}
                disabled={uploadingField !== null}
                onPick={(file) => void handleImageUpload("id_back_url", file)}
                onPreview={() => idBackImage && setPreview({ src: idBackImage, title: IMAGE_SLOTS.id_back_url.previewTitle })}
              />
            </div>
          </Panel>
        </div>

        {/* ------------------------------ Side column ------------------------------ */}
        <aside className="space-y-6">
          <Panel className="space-y-4">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
                <Save size={18} className="text-indigo-600" />
                حفظ التغييرات الشاملة
              </h3>
              <p className="text-sm text-slate-500">حفظ كافة البيانات المدخلة في الملف الشخصي ووسائل الدفع.</p>
            </div>
            <p className={cx("text-xs font-bold", isDirty ? "text-indigo-600" : "text-slate-400")}>
              {isDirty ? "لديك تغييرات غير محفوظة." : "لا توجد تغييرات غير محفوظة."}
            </p>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={busy}
              className={cx(
                FOCUS_RING,
                "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-black text-white shadow-xl shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:opacity-60"
              )}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              حفظ كل البيانات
            </button>
          </Panel>

          <Panel className="space-y-4">
            <div className="space-y-1">
              <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
                <KeyRound size={18} className="text-indigo-600" />
                الأمان وكلمة المرور
              </h3>
              <p className="text-sm text-slate-500">إدارة أمان الحساب وتغيير كلمة السر.</p>
            </div>
            <button
              type="button"
              onClick={() => setPasswordOpen(true)}
              className={cx(
                FOCUS_RING,
                "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-indigo-600"
              )}
            >
              <KeyRound size={15} />
              تغيير كلمة المرور
            </button>
          </Panel>

          <Panel>
            <PanelHeader
              icon={<History size={20} />}
              title="سجلات البطاقة والبيانات"
              aside={
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">
                  {records.length} سجل متاح
                </span>
              }
            />

            {records.length === 0 ? (
              <p className="py-8 text-center text-sm font-semibold text-slate-400">
                لا توجد سجلات مسجلة حالياً. احفظ بياناتك لإنشاء السجل.
              </p>
            ) : (
              records.map((record) => (
                <div key={record.user_id} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ["id_front_url", "وجه البطاقة"],
                        ["id_back_url", "ظهر البطاقة"],
                      ] as const
                    ).map(([field, label]) => (
                      <button
                        key={field}
                        type="button"
                        disabled={!record[field]}
                        onClick={() => setPreview({ src: record[field], title: IMAGE_SLOTS[field].previewTitle })}
                        aria-label={`معاينة ${label}`}
                        className="grid aspect-[8/5] place-items-center overflow-hidden rounded-2xl border-2 border-slate-300 bg-slate-200 shadow-xs disabled:cursor-default"
                      >
                        {record[field] ? (
                          <img src={record[field]} alt={label} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-slate-400">{label}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {recordEditing ? (
                    <div className="space-y-2">
                      {(
                        [
                          ["name", "الاسم", "text"],
                          ["phone", "الهاتف", "tel"],
                          ["city", "المدينة", "text"],
                          ["vodafone_cash_number", "فودافون كاش", "tel"],
                          ["instapay_username", "إنستا باي", "text"],
                        ] as const
                      ).map(([key, label, type]) => (
                        <input
                          key={key}
                          type={type}
                          aria-label={label}
                          placeholder={label}
                          value={recordForm[key]}
                          onChange={(e) => setRecordForm((prev) => ({ ...prev, [key]: e.target.value }))}
                          className={SMALL_INPUT}
                        />
                      ))}
                    </div>
                  ) : (
                    <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 text-sm">
                      {(
                        [
                          ["الاسم", record.name || "بدون اسم"],
                          ["البريد", record.email || "غير محدد"],
                          ["الهاتف", record.phone || "بدون هاتف"],
                          ["المدينة", record.city || "بدون مدينة"],
                          ["فودافون", record.vodafone_cash_number || "غير محدد"],
                          ["إنستا باي", record.instapay_username || "غير محدد"],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between gap-3 py-2.5">
                          <dt className="shrink-0 text-xs font-semibold text-slate-500">{label}</dt>
                          <dd className="min-w-0 truncate font-bold text-slate-900">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {recordEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setRecordEditing(false)}
                          disabled={recordBusy}
                          className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-300"
                        >
                          إلغاء
                        </button>
                        <button
                          type="button"
                          onClick={handleUpdateRecord}
                          disabled={recordBusy}
                          className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {recordBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          حفظ التعديل
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={startRecordEdit}
                          disabled={isEditing || busy}
                          title={isEditing ? "أنهِ تعديل الملف الشخصي أولاً" : undefined}
                          className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                        >
                          <Edit3 size={14} />
                          تعديل السجل
                        </button>
                        <button
                          type="button"
                          onClick={handleDeleteRecord}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-xl bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                        >
                          {recordBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          حذف نهائي
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </Panel>
        </aside>
      </div>

      {/* ------------------------------ Sticky edit bar ------------------------------ */}
      {isEditing && (
        <div className="fixed inset-x-4 bottom-4 z-40 flex justify-center">
          <div className="flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl">
            <span className="text-sm font-bold">
              {isDirty ? "لديك تغييرات غير محفوظة." : "وضع التعديل مفعّل."}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold transition-colors hover:bg-white/20"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saving || !isDirty}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                حفظ كل البيانات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------ Toast ------------------------------ */}
      {notice && (
        <div
          className={cx(
            "pointer-events-none fixed inset-x-4 z-50 flex justify-center",
            isEditing ? "bottom-24" : "bottom-4 sm:bottom-6"
          )}
        >
          <div
            key={notice.id}
            role={notice.type === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto flex w-full max-w-lg items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm font-bold shadow-xl",
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-rose-200 bg-rose-50 text-rose-900"
            )}
          >
            {notice.type === "success" ? (
              <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
            )}
            <span className="flex-1 leading-relaxed">{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="إغلاق الإشعار"
              className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------ Modals ------------------------------ */}
      {passwordOpen && (
        <Modal
          title="تغيير كلمة المرور"
          icon={<ShieldCheck size={20} className="text-indigo-600" />}
          onClose={closePasswordModal}
          className="max-w-md"
        >
          {passwordError && (
            <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-bold text-rose-700">
              {passwordError}
            </p>
          )}
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Field label="كلمة المرور الجديدة">
              <input
                type="password"
                required
                autoFocus
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="تأكيد كلمة المرور الجديدة">
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={INPUT}
              />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closePasswordModal}
                className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={changingPassword}
                className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-black text-white shadow-md transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {changingPassword && <Loader2 size={15} className="animate-spin" />}
                حفظ
              </button>
            </div>
          </form>
        </Modal>
      )}

      {preview && (
        <Modal
          title={preview.title}
          onClose={() => setPreview(null)}
          className="max-w-3xl"
          overlayClassName="bg-black/85 backdrop-blur-sm"
        >
          <div className="flex h-[70vh] w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-900">
            <img src={preview.src} alt={preview.title} className="h-full w-full object-contain" />
          </div>
        </Modal>
      )}
    </div>
  );
}