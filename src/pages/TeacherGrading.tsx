import { useState, useEffect } from "react";
import {
  Users,
  Search,
  Clock,
  BookOpen,
  Layers,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Eye,
  Sparkles,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function StudentsSubmissionsPage() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<number | null>(null);

  useEffect(() => {
    fetchAllSubmissions();

    const channel = supabase
      .channel('public:student_submissions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_submissions' },
        () => {
          fetchAllSubmissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAllSubmissions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("student_submissions")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;

      if (data) {
        setSubmissions(data); // عرض كل المحاولات والتسليمات بدون استثناء
      }
    } catch (error: any) {
      console.error("خطأ في جلب درجات الطلاب:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredSubmissions = submissions.filter((item) =>
    item.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.course_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleExpand = (id: number) => {
    setExpandedSubmissionId(expandedSubmissionId === id ? null : id);
  };

  return (
    <div className="space-y-6 text-slate-800 min-h-screen pb-12" dir="rtl">
      
      {/* رأس الصفحة الفاخر */}
      <div className="relative overflow-hidden bg-gradient-to-l from-indigo-900 via-slate-900 to-blue-950 rounded-3xl p-6 sm:p-8 shadow-xl text-white border border-slate-800">
        <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold border border-white/10 text-indigo-200">
            <Sparkles size={14} className="text-amber-400" />
            <span>لوحة تقييم الطلاب الذكية - منصة Z E D</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            سجل اختبارات ومحاولات الطلاب بالكامل
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            متابعة دقيقة لكل محاولات الاختبارات السابقة والجديدة للطلاب، مع استعراض التفاصيل والإجابات الكاملة.
          </p>
        </div>
      </div>

      {/* شريط البحث والتحديث */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم الطالب أو الكورس..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all"
          />
        </div>
        
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <div className="text-xs font-medium text-slate-600 bg-slate-100/80 px-3 py-2 rounded-xl border border-slate-200/60">
            إجمالي المحاولات: <span className="text-indigo-600 font-bold">{filteredSubmissions.length}</span> محاولة
          </div>

          <button
            onClick={fetchAllSubmissions}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-200/60 flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>تحديث البيانات</span>
          </button>
        </div>
      </div>

      {/* المحتوى أو التحميل */}
      {loading ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-medium text-slate-500">جاري جلب جميع سجلات اختبارات الطلاب...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="py-16 text-center space-y-3 bg-white border border-slate-200 rounded-3xl shadow-xs">
          <AlertCircle size={32} className="text-indigo-500 mx-auto" />
          <p className="text-xs sm:text-sm font-semibold text-slate-600">لا توجد تسليمات مطابقة لبحثك حالياً.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredSubmissions.map((item) => {
            const isExpanded = expandedSubmissionId === item.id;
            const mcqAnswers = item.student_answers?.mcq_answers || {};
            const essayAnswers = item.student_answers?.essay_answers || {};
            const uploadedFiles = item.student_answers?.uploaded_files || {};
            const isFailed = item.status === 'راسب';
            const maxScoreNum = Number(item.max_score) || 100;

            return (
              <div
                key={item.id}
                className="bg-white border-2 border-slate-200/70 rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-lg hover:border-indigo-500/60 transition-all duration-300 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-4">
                  
                  {/* الهيدر الخاص بالكرت */}
                  <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-50 to-blue-50 text-indigo-600 flex items-center justify-center font-black text-sm shrink-0 border border-indigo-100 shadow-xs">
                        <Users size={22} />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-base font-black text-slate-900 tracking-tight">{item.student_name}</h3>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${isFailed ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                            {isFailed ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
                            {item.status || "ناجح"}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">(محاولة رقم: {item.id})</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* شارة الدرجة النهائية */}
                    <div className="text-left bg-gradient-to-br from-indigo-900 to-slate-900 text-white px-3.5 py-2 rounded-2xl shadow-sm shrink-0 border border-slate-800">
                      <span className="text-[9px] block text-indigo-300 font-semibold uppercase tracking-wider">الدرجة الكلية</span>
                      <div className="flex items-baseline gap-1">
                        <strong className="text-base font-black text-white">{item.score}</strong>
                        <span className="text-[10px] text-slate-400">/ {maxScoreNum}</span>
                      </div>
                    </div>
                  </div>

                  {/* تفاصيل الكورس والتخصص */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <BookOpen size={14} />
                      </div>
                      <div className="truncate">
                        <span className="text-[10px] text-slate-400 block font-medium">الكورس / الاختبار (ID: {item.quiz_id})</span>
                        <span className="font-bold text-slate-800 truncate block">{item.course_name}</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <Layers size={14} />
                      </div>
                      <div className="truncate">
                        <span className="text-[10px] text-slate-400 block font-medium">التخصص</span>
                        <span className="font-bold text-indigo-700 truncate block">{item.specialty}</span>
                      </div>
                    </div>
                  </div>

                  {/* قسم استعراض إجابات الطالب القابلة للطي */}
                  {item.student_answers && (
                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="w-full flex items-center justify-between p-3 bg-slate-100/80 hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold border border-slate-200/80 transition-all cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Eye size={15} className="text-indigo-600" />
                          <span>عرض تفاصيل الإجابات والملفات المرفقة</span>
                        </span>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {isExpanded && (
                        <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-3.5 text-xs animate-fadeIn">
                          {Object.keys(mcqAnswers).length > 0 && (
                            <div className="space-y-2">
                              <span className="font-extrabold text-blue-700 block border-b border-blue-100 pb-1">أسئلة الاختيار من متعدد:</span>
                              {Object.entries(mcqAnswers).map(([qIndex, ans], i) => (
                                <div key={i} className="p-2.5 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between shadow-2xs">
                                  <span className="text-slate-500 font-semibold">السؤال ({Number(qIndex) + 1})</span>
                                  <span className="font-black text-slate-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                                    {String(ans)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {Object.keys(essayAnswers).length > 0 && (
                            <div className="space-y-2 pt-1">
                              <span className="font-extrabold text-indigo-700 block border-b border-indigo-100 pb-1">الأسئلة المقالية:</span>
                              {Object.entries(essayAnswers).map(([qIndex, ans], i) => (
                                <div key={i} className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1.5 shadow-2xs">
                                  <span className="text-slate-500 font-semibold block">إجابة السؤال المقالي ({Number(qIndex) + 1})</span>
                                  <p className="font-medium text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                                    {String(ans) || "لم يكتب إجابة"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}

                          {Object.keys(uploadedFiles).length > 0 && (
                            <div className="space-y-2 pt-1">
                              <span className="font-extrabold text-emerald-700 block border-b border-emerald-100 pb-1">الملفات المرفقة:</span>
                              {Object.entries(uploadedFiles).map(([qIndex, fileObj]: [string, any], i) => (
                                <div key={i} className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                                  <span className="text-slate-600 font-semibold">ملف السؤال ({Number(qIndex) + 1})</span>
                                  <a
                                    href={fileObj.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-700 font-bold underline flex items-center gap-1.5 truncate max-w-[180px] hover:text-emerald-900"
                                  >
                                    <FileText size={14} />
                                    <span className="truncate">{fileObj.name}</span>
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}

                          {Object.keys(mcqAnswers).length === 0 && Object.keys(essayAnswers).length === 0 && Object.keys(uploadedFiles).length === 0 && (
                            <p className="text-slate-500 text-center py-2">لا توجد تفاصيل إجابات مسجلة لهذا التسليم.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* وقت التسليم */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <Clock size={13} className="text-amber-500" />
                    وقت التسليم:
                  </span>
                  <span className="text-slate-700 font-bold bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">{item.submission_time}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
