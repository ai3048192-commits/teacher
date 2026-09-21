import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Eye,
  Check,
  BookOpen,
  ArrowRight,
  Smartphone,
  X,
  Trash2
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function TeacherStudentSubscriptionsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // حالة لتخزين الاشتراكات القادمة من Supabase
  const [studentSubscriptions, setStudentSubscriptions] = useState<any[]>([]);

  // حالة لعرض تفاصيل الطالب المحدد في نافذة منبثقة (Modal)
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<any>(null);

  // جلب الاشتراكات الحقيقية من قاعدة البيانات
  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;

      if (data) {
        const formattedData = data.map((item: any) => ({
          id: item.id,
          studentName: item.student_name || "طالب غير معروف",
          code: item.student_code || "بدون كود",
          grade: "الصف الدراسي العام",
          groupName: "المجموعة الافتراضية",
          contentName: item.course_name || "كورس تعليمي",
          amountPaid: "حسب الكورس",
          paymentMethod: item.payment_method === "vodafone" ? "فودافون كاش" : "إنستاباي",
          paymentNumber: item.sender_number || "غير محدد",
          receiptImage: item.receipt_image_url || "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=60",
          status: item.status || "pending", // pending, active, rejected
          date: item.created_at ? item.created_at.split('T')[0] : "حديث"
        }));
        setStudentSubscriptions(formattedData);
      }
    } catch (err: any) {
      console.error("Error fetching subscriptions:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();

    // الاستماع لأي إدخال جديد للطلاب في قاعدة البيانات (Real-time)
    const channel = supabase
      .channel("public:subscriptions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions" },
        () => {
          fetchSubscriptions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // تحديث حالة القبول في Supabase
  const handleApprove = async (id: number) => {
    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("id", id);

      if (error) throw error;

      setStudentSubscriptions(
        studentSubscriptions.map((sub) =>
          sub.id === id ? { ...sub, status: "active" } : sub
        )
      );
      if (selectedStudentDetail && selectedStudentDetail.id === id) {
        setSelectedStudentDetail({ ...selectedStudentDetail, status: "active" });
      }
      setSuccessMessage("تم قبول اشتراك الطالب وتفعيل وصوله للمحتوى بنجاح! ✅");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: any) {
      alert(`خطأ أثناء التحديث: ${err.message}`);
    }
  };

  // تحديث حالة الرفض في Supabase
  const handleReject = async (id: number) => {
    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "rejected" })
        .eq("id", id);

      if (error) throw error;

      setStudentSubscriptions(
        studentSubscriptions.map((sub) =>
          sub.id === id ? { ...sub, status: "rejected" } : sub
        )
      );
      if (selectedStudentDetail && selectedStudentDetail.id === id) {
        setSelectedStudentDetail({ ...selectedStudentDetail, status: "rejected" });
      }
      setSuccessMessage("تم رفض إيصال الدفع وإرسال تنبيه للطالب. ⚠️");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: any) {
      alert(`خطأ أثناء الرفض: ${err.message}`);
    }
  };

  // حذف السجل نهائياً من قاعدة بيانات Supabase
  const handleDelete = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا السجل نهائياً من قاعدة البيانات؟")) return;
    try {
      const { error } = await supabase
        .from("subscriptions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setStudentSubscriptions(studentSubscriptions.filter((sub) => sub.id !== id));
      if (selectedStudentDetail && selectedStudentDetail.id === id) {
        setSelectedStudentDetail(null);
      }
      setSuccessMessage("تم حذف طلب الاشتراك نهائياً من قاعدة البيانات. 🗑️");
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: any) {
      alert(`خطأ أثناء الحذف: ${err.message}`);
    }
  };

  const filteredStudents = studentSubscriptions.filter((sub) => {
    const matchesSearch =
      sub.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.contentName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 text-slate-800 min-h-screen" dir="rtl">
      
      {/* رأس الصفحة */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-900 rounded-3xl p-6 sm:p-10 shadow-xl text-white border border-blue-500/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="px-3 py-1 bg-white/25 backdrop-blur-md text-white text-[11px] font-bold rounded-full inline-flex items-center gap-1.5 border border-white/30">
              <Users size={12} />
              إدارة الاشتراكات والمدفوعات الحية - منصة Z E D
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-wide">
              متابعة اشتراكات وإيصالات دفع الطلاب (Supabase)
            </h1>
            <p className="text-xs sm:text-sm text-blue-200 font-semibold">
              الطلبات التي يسجلها الطلاب في صفحة الكورسات تظهر هنا فوراً للمراجعة واتخاذ القرار.
            </p>
          </div>

          <Link
            to="/teacher-dashboard"
            className="px-5 py-3 bg-white text-slate-900 hover:bg-slate-100 rounded-2xl text-xs font-black shadow-lg transition-all flex items-center gap-2 self-start md:self-auto"
          >
            <ArrowRight size={16} />
            <span>العودة للوحة المعلم</span>
          </Link>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-200 text-emerald-900 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-sm">
          <Check size={18} className="text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* إحصائيات حية مبنية على قاعدة البيانات */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-50 border-2 border-slate-100 rounded-3xl p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-sm"><Users size={24} /></div>
          <div><p className="text-xs font-bold text-slate-500">إجمالي طلبات الطلاب</p><h3 className="text-lg font-black text-slate-800">{studentSubscriptions.length} طلبات</h3></div>
        </div>
        <div className="bg-emerald-50/50 border-2 border-emerald-100 rounded-3xl p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-sm"><CheckCircle2 size={24} /></div>
          <div><p className="text-xs font-bold text-slate-500">الاشتراكات المفعلة</p><h3 className="text-lg font-black text-slate-800">{studentSubscriptions.filter(s => s.status === 'active').length} طالب</h3></div>
        </div>
        <div className="bg-amber-50/50 border-2 border-amber-100 rounded-3xl p-5 flex items-center gap-4">
          <div className="p-3 bg-amber-600 text-white rounded-2xl shadow-sm"><Clock size={24} /></div>
          <div><p className="text-xs font-bold text-slate-500">بانتظار المراجعة</p><h3 className="text-lg font-black text-slate-800">{studentSubscriptions.filter(s => s.status === 'pending').length} طلبات</h3></div>
        </div>
      </div>

      {/* البحث والفلترة */}
      <div className="bg-white border-2 border-blue-100 rounded-3xl p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم الطالب، الكود، أو اسم الكورس..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={16} className="text-blue-600" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-blue-500 w-full md:w-auto"
          >
            <option value="all">كل حالات الاشتراكات</option>
            <option value="active">مفعل (تم القبول)</option>
            <option value="pending">معلق (بانتظار المراجعة)</option>
            <option value="rejected">مرفوض</option>
          </select>
        </div>
      </div>

      {/* جدول عرض الطلاب الحقيقيين */}
      <div className="bg-white border-2 border-blue-100 rounded-3xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-blue-50/70 border-b border-blue-100 text-[11px] font-black text-slate-700">
                <th className="p-4 sm:px-6">الطالب والكود</th>
                <th className="p-4">الكورس المطلوب</th>
                <th className="p-4">طريقة ورقم الدفع</th>
                <th className="p-4">تاريخ الطلب</th>
                <th className="p-4">الحالة</th>
                <th className="p-4 sm:px-6 text-center">عرض تفاصيل الكرت والايصال</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50 text-xs font-semibold">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 font-bold">
                    جاري جلب طلبات الطلاب من قاعدة البيانات...
                  </td>
                </tr>
              ) : filteredStudents.length > 0 ? (
                filteredStudents.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 sm:px-6 space-y-0.5">
                      <div className="font-black text-slate-900">{sub.studentName}</div>
                      <div className="text-[11px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md inline-block">
                        {sub.code}
                      </div>
                    </td>
                    <td className="p-4 font-bold text-indigo-900">
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={14} className="text-blue-600 shrink-0" />
                        <span>{sub.contentName}</span>
                      </div>
                    </td>
                    <td className="p-4 space-y-0.5">
                      <div className="font-black text-slate-900">{sub.paymentMethod}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{sub.paymentNumber}</div>
                    </td>
                    <td className="p-4 text-slate-500 text-[11px]">
                      {sub.date}
                    </td>
                    <td className="p-4">
                      {sub.status === "active" && (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold border border-emerald-200 inline-block">
                          مفعل ✓
                        </span>
                      )}
                      {sub.status === "pending" && (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold border border-amber-200 inline-block">
                          بانتظار المراجعة ⌛
                        </span>
                      )}
                      {sub.status === "rejected" && (
                        <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full text-[10px] font-bold border border-rose-200 inline-block">
                          مرفوض ✕
                        </span>
                      )}
                    </td>
                    <td className="p-4 sm:px-6 text-center">
                      <button
                        onClick={() => setSelectedStudentDetail(sub)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md transition-all inline-flex items-center gap-1.5"
                      >
                        <Eye size={15} />
                        <span>عرض تفاصيل الإيصال</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 font-bold">
                    لا توجد طلبات اشتراك مسجلة حتى الآن.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة منبثقة (Modal) لعرض تفاصيل الطالب والإيصال الحقيقي */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full space-y-6 shadow-2xl relative my-8" dir="rtl">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-black rounded-md">
                  {selectedStudentDetail.code}
                </span>
                <h3 className="text-lg font-black text-slate-900">{selectedStudentDetail.studentName}</h3>
              </div>
              <button
                onClick={() => setSelectedStudentDetail(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-1 sm:col-span-2">
                <span className="text-indigo-400 font-bold block">الكورس المطلوب:</span>
                <span className="font-black text-indigo-950 text-sm flex items-center gap-2">
                  <BookOpen size={16} className="text-indigo-600" />
                  {selectedStudentDetail.contentName}
                </span>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                <span className="text-slate-400 font-bold block">طريقة الدفع:</span>
                <span className="font-black text-slate-800 flex items-center gap-1.5">
                  <Smartphone size={14} className="text-rose-600" />
                  {selectedStudentDetail.paymentMethod}
                </span>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
                <span className="text-slate-400 font-bold block">رقم المرسل / الحساب:</span>
                <span className="font-black text-slate-800 font-mono text-sm">
                  {selectedStudentDetail.paymentNumber}
                </span>
              </div>
            </div>

            {/* معاينة صورة الإيصال المرفوعة من سلة Supabase Storage */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-800 block">صورة إيصال التحويل المرفقة:</label>
              <div className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-slate-900 max-h-72 flex items-center justify-center p-2">
                <img
                  src={selectedStudentDetail.receiptImage}
                  alt="إيصال التحويل"
                  className="max-h-64 object-contain rounded-xl"
                  onError={(e: any) => {
                    e.target.src = "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=60";
                  }}
                />
              </div>
            </div>

            {/* أزرار الإجراءات للقبول، الرفض، والحذف */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                {selectedStudentDetail.status === "active" && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 inline-block">
                    ✓ تم قبول هذا الطالب مسبقاً
                  </span>
                )}
                {selectedStudentDetail.status === "rejected" && (
                  <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 inline-block">
                    ✕ تم رفض الإيصال
                  </span>
                )}
                {selectedStudentDetail.status === "pending" && (
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 inline-block">
                    ⌛ الطلب بانتظار اتخاذ قرار
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleDelete(selectedStudentDetail.id)}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md transition-all inline-flex items-center gap-1.5"
                >
                  <Trash2 size={14} />
                  <span>حذف نهائي</span>
                </button>

                {selectedStudentDetail.status !== "active" && (
                  <button
                    type="button"
                    onClick={() => handleApprove(selectedStudentDetail.id)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md transition-all"
                  >
                    قبول وتفعيل
                  </button>
                )}

                {selectedStudentDetail.status !== "rejected" && (
                  <button
                    type="button"
                    onClick={() => handleReject(selectedStudentDetail.id)}
                    className="px-4 py-2.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl text-xs font-bold transition-all"
                  >
                    رفض الإيصال
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedStudentDetail(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  إغلاق
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}