import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { CheckCircle2, Loader2, ShieldCheck, Clock, Check, UserCheck, Smartphone, Landmark, Sparkles, Copy, AlertCircle, User, Phone } from "lucide-react";

export default function CheckoutWithPackagesPage({ user, onSuccess }: { user: any; onSuccess: () => void }) {
  const [plan, setPlan] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState("vodafone");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingPlan, setFetchingPlan] = useState(true);
  const [successMsg, setSuccessMsg] = useState("");
  const [isPendingReview, setIsPendingReview] = useState(false);
  // الاشتراك المفعّل بيتعرض كرسالة بدل ما يستدعي onSuccess وقت التحميل.
  // الاستدعاء وقت التحميل كان بيعمل reload في لفة مالهاش نهاية.
  const [isActive, setIsActive] = useState(false);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // حقول إضافية لضمان معرفة اسم المعلم ورقم هاتفه الحقيقي بدقة
  const [customTeacherName, setCustomTeacherName] = useState("");
  const [customTeacherPhone, setCustomTeacherPhone] = useState("");

  const transferNumber = "01026377928";

  const handleCopyNumber = () => {
    navigator.clipboard.writeText(transferNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    // الـ channel لازم يتعرّف هنا، مش جوه الدالة الـ async.
    // الكود القديم كان بيرجّع الـ cleanup من جوه الدالة، فالـ effect نفسه
    // مكانش بيرجّع حاجة، والـ channel مكانش بيتقفل أبداً. أول ما الصفحة
    // تتفتح تاني، Supabase بيرجّع نفس الـ channel القديم المشترك بالفعل،
    // و .on() عليه بيرمي: cannot add postgres_changes callbacks after subscribe()
    let subscriptionChannel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const fetchPackageAndSession = async () => {
      try {
        setFetchingPlan(true);
        const { data: packagesData, error: pkgError } = await supabase
          .from("packages")
          .select("*")
          .limit(1);

        if (!pkgError && packagesData && packagesData.length > 0) {
          setPlan(packagesData[0]);
        } else {
          setPlan({
            id: "default-all-inclusive",
            name: "الباقة الشاملة للمنصة",
            price: 299,
            description: "اشتراك شامل لجميع مميزات المنصة وإدارة الطلاب والامتحانات بلا حدود.",
            features: [
              "إدارة كاملة للطلاب والسنتر والتحكم الكامل",
              "رفع وتدريس الامتحانات والواجبات بلا حدود",
              "لوحة تحكم إحصائية متكاملة لمتابعة الأرباح",
              "دعم فني وتحديثات مستمرة للمنصة مجاناً"
            ]
          });
        }

        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user || user;
        setSessionUser(currentUser);

        // تعبئة البيانات التلقائية إذا كانت متوفرة في الـ Metadata
        if (currentUser) {
          if (currentUser.user_metadata?.full_name) {
            setCustomTeacherName(currentUser.user_metadata.full_name);
          }
          if (currentUser.user_metadata?.phone || currentUser.phone) {
            setCustomTeacherPhone(currentUser.user_metadata?.phone || currentUser.phone);
          }
        }

        const currentUserId = currentUser?.id;
        const currentUserEmail = currentUser?.email;

        if (!currentUserId && !currentUserEmail) return;

        const { data, error } = await supabase
          .from("teacher_subscriptions")
          .select("status")
          .or(`teacher_id.eq.${currentUserId || 'none'},teacher_email.eq.${currentUserEmail || 'none'}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          if (data.status === "active") {
            setIsActive(true);
          } else if (data.status === "pending") {
            setIsPendingReview(true);
          }
        }

        if (cancelled || !currentUserId) return;

        // اسم فريد لكل معلم + فلتر، بدل ما يسمع لكل تغييرات الجدول
        subscriptionChannel = supabase
          .channel(`teacher_subscription_page_${currentUserId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "teacher_subscriptions",
              filter: `teacher_id=eq.${currentUserId}`,
            },
            (payload: any) => {
              if (payload.new?.status === "active") {
                setIsPendingReview(false);
                setIsActive(true);
                // هنا بس بنستدعي onSuccess: لما الحالة تتغير فعلاً من pending لـ active
                if (onSuccess) onSuccess();
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setFetchingPlan(false);
      }
    };

    fetchPackageAndSession();

    return () => {
      cancelled = true;
      if (subscriptionChannel) void supabase.removeChannel(subscriptionChannel);
    };
  }, [user]);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptFile) {
      alert("يرجى إرفاق صورة إيصال التحويل أولاً");
      return;
    }
    if (!customTeacherName.trim() || !customTeacherPhone.trim()) {
      alert("يرجى إدخال اسمك ورقم هاتفك المحول منه بدقة");
      return;
    }
    if (!plan) {
      alert("بيانات الباقة غير متوفرة حالياً");
      return;
    }

    try {
      setLoading(true);

      const activeUserId = sessionUser?.id || user?.id || null;
      const activeUserEmail = sessionUser?.email || user?.email || "no-email@platform.com";

      const fileExt = receiptFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("teacher-receipts")
        .upload(filePath, receiptFile);

      let publicUrl = "";
      if (!uploadError) {
        const { data: publicData } = supabase.storage
          .from("teacher-receipts")
          .getPublicUrl(filePath);
        publicUrl = publicData.publicUrl;
      } else {
        publicUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(receiptFile);
        });
      }

      const { error: insertError } = await supabase
        .from("teacher_subscriptions")
        .insert([
          {
            teacher_id: activeUserId,
            teacher_email: activeUserEmail,
            teacher_name: customTeacherName.trim(), // الاسم الحقيقي الذي أدخله المعلم
            teacher_phone: customTeacherPhone.trim(), // رقم الهاتف الحقيقي
            plan_name: plan.name,
            amount: plan.price,
            payment_method: paymentMethod,
            receipt_url: publicUrl,
            status: "pending"
          }
        ]);

      if (insertError) throw insertError;

      setSuccessMsg("تم إرسال إيصال الدفع بنجاح! يتم الآن مراجعة الطلب من الإدارة وسيتم فتح الداشبورد تلقائياً فور الموافقة.");
      setIsPendingReview(true);
      setReceiptFile(null);

    } catch (err: any) {
      alert("حدث خطأ أثناء رفع الإيصال: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingPlan) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3 bg-white rounded-3xl max-w-2xl mx-auto border border-slate-200">
        <Loader2 size={36} className="animate-spin text-purple-600" />
        <p className="text-xs font-bold text-slate-500">جاري تحميل تفاصيل الباقة الشاملة...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto  border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6" dir="rtl">
      {/* رأس الصفحة */}
      <div className="text-center space-y-2 border-b border-slate-100 pb-6">
        <span className="px-3.5 py-1.5 bg-purple-50 text-purple-700 text-xs font-black rounded-full inline-flex items-center gap-1.5 border border-purple-100 shadow-2xs">
          <ShieldCheck size={14} /> بوابة تفعيل حساب المعلم الشامل
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900">تفعيل اشتراك المنصة بشكل كامل</h2>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">قم بتحويل قيمة الاشتراك إلى الرقم المخصص أدناه، ثم أدخل بياناتك وأرفق إيصال التحويل.</p>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 shadow-2xs">
          <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
          <span className="text-xs font-bold leading-relaxed">{successMsg}</span>
        </div>
      )}

      {isActive && !successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 shadow-2xs">
          <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
          <span className="text-xs font-bold leading-relaxed">
            اشتراكك مفعّل حالياً. يمكنك تجديده من هنا قبل انتهاء المدة.
          </span>
        </div>
      )}

      {isPendingReview && !successMsg && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl flex items-center gap-3 shadow-2xs">
          <Clock size={22} className="text-amber-600 shrink-0 animate-pulse" />
          <span className="text-xs font-bold leading-relaxed">طلبك قيد المراجعة حالياً من الإدارة. سيتم فتح لوحة التحكم تلقائياً بمجرد الاعتماد!</span>
        </div>
      )}

      {/* كارت الباقة الشاملة */}
      {plan && (
        <div className="relative bg-gradient-to-br from-purple-950 via-slate-900 to-purple-900 text-white rounded-3xl p-6 shadow-xl overflow-hidden border border-purple-800/50 space-y-5">
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-purple-600/20 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-purple-500/20 border border-purple-400/30 text-purple-300 rounded-2xl">
                <Sparkles size={20} />
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-purple-300 font-bold block">باقة المنصة الكاملة</span>
                <h3 className="text-base font-black text-white">{plan.name}</h3>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-2xl text-center">
              <span className="text-xs text-purple-200 block font-bold">التكلفة</span>
              <span className="text-lg font-black text-white">{plan.price} ج.م</span>
            </div>
          </div>

          <p className="text-xs text-purple-100/80 leading-relaxed relative z-10">
            {plan.description}
          </p>

          <div className="border-t border-purple-800/60 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 relative z-10">
            {plan.features?.map((feat: string, idx: number) => (
              <div key={idx} className="flex items-center gap-2 text-xs font-bold text-purple-50">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0">
                  <Check size={10} className="text-emerald-400" />
                </div>
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* نموذج الدفع وإدخال البيانات */}
      {plan && (
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-5">
          <form onSubmit={handleFileUpload} className="space-y-4">
            
            {/* حقول إدخال اسم المعلم ورقم الهاتف الحقيقي لضمان عدم ظهور بيانات وهمية */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <User size={14} className="text-purple-600" /> اسم المعلم الثلاثي:
                </label>
                <input
                  type="text"
                  placeholder="أدخل اسمك الحقيقي هنا"
                  value={customTeacherName}
                  onChange={(e) => setCustomTeacherName(e.target.value)}
                  required
                  className="w-full text-xs border border-slate-200 rounded-2xl p-3 bg-white focus:outline-purple-600 font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Phone size={14} className="text-purple-600" /> رقم الهاتف المحول منه:
                </label>
                <input
                  type="text"
                  placeholder="مثال: 01012345678"
                  value={customTeacherPhone}
                  onChange={(e) => setCustomTeacherPhone(e.target.value)}
                  required
                  className="w-full text-xs border border-slate-200 rounded-2xl p-3 bg-white focus:outline-purple-600 font-bold"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-black text-slate-800 block">اختر وسيلة الدفع المناسبة للتحويل:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("vodafone")}
                  className={`p-3.5 rounded-2xl text-xs font-black border-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    paymentMethod === 'vodafone' 
                      ? 'border-purple-600 bg-purple-50 text-purple-900 shadow-2xs' 
                      : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                  }`}
                >
                  <Smartphone size={16} className="text-rose-600" /> فودافون كاش
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("instapay")}
                  className={`p-3.5 rounded-2xl text-xs font-black border-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    paymentMethod === 'instapay' 
                      ? 'border-purple-600 bg-purple-50 text-purple-900 shadow-2xs' 
                      : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                  }`}
                >
                  <Landmark size={16} className="text-purple-600" /> انستا باي (InstaPay)
                </button>
              </div>
            </div>

            {/* صندوق رقم التحويل */}
            <div className="p-4 bg-purple-900 text-white rounded-2xl border border-purple-800 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
              <div className="space-y-1 text-center sm:text-right">
                <span className="text-[11px] text-purple-200 font-bold block flex items-center justify-center sm:justify-start gap-1">
                  <AlertCircle size={14} className="text-amber-400" />
                  قم بالتحويل الآن عبر {paymentMethod === 'vodafone' ? 'فودافون كاش' : 'انستا باي'} إلى الرقم التالي:
                </span>
                <div className="text-xl sm:text-2xl font-black tracking-wider text-amber-300 font-mono">
                  {transferNumber}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyNumber}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer"
              >
                {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                {copied ? "تم النسخ!" : "نسخ الرقم"}
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-800 block">صورة إيصال التحويل (صورة واضحة):</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 border border-slate-200 rounded-2xl p-2 cursor-pointer bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !plan}
              className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-black shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
              تأكيد وإرسال إيصال الاشتراك ({plan ? plan.price : 0} ج.م)
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
