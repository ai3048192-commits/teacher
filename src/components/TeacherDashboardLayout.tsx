import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import CheckoutWithPackagesPage from "../pages/AdminTeacherSubscriptions";

/* ================================================================== */
/*  إعدادات مدة الاشتراك                                                */
/* ================================================================== */

const PLAN_DAYS = 30;
const GRACE_DAYS = 4;

type Status = "loading" | "active" | "grace_period" | "expired" | "pending" | "none";

const dayDiff = (fromIso: string) => {
  const t = Date.parse(String(fromIso).replace(" ", "T"));
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.ceil((Date.now() - t) / 86_400_000);
};

/* ================================================================== */
/*  الكمبوننت                                                          */
/* ================================================================== */

export default function TeacherDashboardLayout({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [graceDaysLeft, setGraceDaysLeft] = useState(0);

  const userId = user?.id ?? null;

  const verifySubscription = useCallback(async () => {
    if (!userId) {
      setStatus("none");
      return;
    }
    try {
      // الكود القديم كان بيجيب آخر صف في الجدول كله من غير أي فلتر، يعني
      // اشتراك أي معلم كان بيفتح المنصة لكل المعلمين. دلوقتي بنفلتر بالمعلم
      // الحالي، و RLS بتفرض نفس الحاجة من ناحية قاعدة البيانات.
      const { data, error } = await supabase
        .from("teacher_subscriptions")
        .select("status, created_at")
        .eq("teacher_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const latest = data?.[0];
      if (!latest) {
        setStatus("none");
        return;
      }

      if (latest.status !== "active") {
        setStatus(latest.status === "pending" ? "pending" : "none");
        return;
      }

      const days = dayDiff(latest.created_at);
      if (days <= PLAN_DAYS) {
        setStatus("active");
      } else if (days <= PLAN_DAYS + GRACE_DAYS) {
        setStatus("grace_period");
        setGraceDaysLeft(PLAN_DAYS + GRACE_DAYS - days);
      } else {
        setStatus("expired");
      }
    } catch (err) {
      console.error("خطأ في التحقق من الاشتراك:", err);
      // فشل الاتصال مش معناه إن الاشتراك منتهي، فمش بنقفل المنصة عليه
      setStatus((prev) => (prev === "loading" ? "none" : prev));
    }
  }, [userId]);

  useEffect(() => {
    void verifySubscription();
    if (!userId) return;

    // الاشتراك بتاع المعلم ده بس، مش أي تغيير في الجدول كله
    const channel = supabase
      .channel(`teacher_subscription_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "teacher_subscriptions", filter: `teacher_id=eq.${userId}` },
        () => void verifySubscription()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, verifySubscription]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-4" dir="rtl">
        <Loader2 size={40} className="animate-spin text-purple-600" />
        <p className="text-xs font-black text-slate-600">جاري التحقق من صلاحيات واشتراك الحساب...</p>
      </div>
    );
  }

  const blocked = status !== "active" && status !== "grace_period";

  if (blocked) {
    return (
      <div className="min-h-screen p-4 sm:p-8" dir="rtl">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            <ShieldAlert size={22} className="shrink-0 text-rose-600" />
            <span className="text-xs font-black leading-relaxed">
              {status === "expired"
                ? `انتهت فترة اشتراكك وفترة السماح (${PLAN_DAYS + GRACE_DAYS} يوماً). تم إغلاق المنصة مؤقتاً، يرجى تجديد الاشتراك ورفع الإيصال لاستعادة الوصول.`
                : status === "pending"
                  ? "تم استلام طلب اشتراكك وهو قيد المراجعة من الإدارة. سيتم تفعيل حسابك فور اعتماد الدفع."
                  : "عذراً، حسابك غير مفعل حتى الآن. يرجى إتمام الدفع أو انتظار مراجعة الإدارة وتفعيل الحساب."}
            </span>
          </div>

          <CheckoutWithPackagesPage user={user} onSuccess={() => void verifySubscription()} />
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl">
      {status === "grace_period" && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 text-xs font-black text-white shadow-sm">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            تنبيه هام: انتهت باقتك الأساسية! لديك مهلة {graceDaysLeft} أيام فقط لتجديد الاشتراك قبل أن يتم إغلاق المنصة
            تلقائياً.
          </span>
        </div>
      )}
      {children}
    </div>
  );
}