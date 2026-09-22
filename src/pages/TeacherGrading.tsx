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
  ArrowRight
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function StudentsSubmissionsPage() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // حالة لاختيار اختبار معين لعرض تفاصيل طلابه
  const [selectedQuiz, setSelectedQuiz] = useState<any | null>(null);
  
  // حالة لعرض تفاصيل إجابات طالب معين داخل الاختبار
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
        setSubmissions(data);
      }
    } catch (error: any) {
      console.error("خطأ في جلب درجات الطلاب:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // تجميع التسليمات حسب الاختبار (باستخدام course_name أو quiz_id كمعرف فريد)
  const groupedQuizzes = submissions.reduce((acc: any, item: any) => {
    const key = `${item.course_name || 'كورس غير محدد'} - ${item.quiz_id || 'عام'}`;
    if (!acc[key]) {
      acc[key] = {
        quizKey: key,
        course_name: item.course_name || 'كورس غير محدد',
        specialty: item.specialty || 'عام',
        quiz_id: item.quiz_id || 'عام',
        submissions: []
      };
    }
    acc[key].submissions.push(item);
    return acc;
  }, {});

  const quizzesList = Object.values(groupedQuizzes);

  // تصفية الكروت الرئيسية حسب البحث
  const filteredQuizzes = quizzesList.filter((quiz: any) =>
    quiz.course_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    quiz.specialty?.toLowerCase().includes(searchTerm.toLowerCase())
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
            سجل اختبارات ومحاولات الطلاب
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            استعرض الاختبارات المجمعة في بطاقات رئيسية، وانقر على "تفاصيل الاختبار" لمتابعة درجات وإجابات الطلاب لكل اختبار على حدة.
          </p>
        </div>
      </div>

      {/* شريط البحث والتحديث */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم الكورس أو التخصص..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all"
          />
        </div>
        
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <div className="text-xs font-medium text-slate-600 bg-slate-100/80 px-3 py-2 rounded-xl border border-slate-200/60">
            إجمالي الاختبارات: <span className="text-indigo-600 font-bold">{filteredQuizzes.length}</span> اختبار
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

      {/* محتوى الصفحة: إما عرض قائمة الاختبارات الرئيسية أو تفاصيل اختبار محدد */}
      {loading ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-medium text-slate-500">جاري جلب سجلات الاختبارات...</p>
        </div>
      ) : selectedQuiz ? (
        /* عرض تفاصيل الطلاب داخل الاختبار المحدد */
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="space-y-1">
              <span className="text-xs text-indigo-600 font-bold">{selectedQuiz.specialty}</span>
              <h2 className="text-lg font-black text-slate-900">تفاصيل اختبار: {selectedQuiz.course_name}</h2>
              <span className="text-xs text-slate-400">معرف الاختبار (Quiz ID: {selectedQuiz.quiz_id}) - عدد المتقدمين: {selectedQuiz.submissions.length} طالب</span>
            </div>
            <button
              onClick={() => setSelectedQuiz(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            >
              <ArrowRight size={14} />
              <span>العودة لكل الاختبارات</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {selectedQuiz.submissions.map((item: any) => {
              const isExpanded = expandedSubmissionId === item.id;
              const mcqAnswers = item.student_answers?.mcq_answers || {};
              const essayAnswers = item.student_answers?.essay_answers || {};
              const uploadedFiles = item.student_answers?.uploaded_files || {};
              const isFailed = item.status === 'راسب';
              const maxScoreNum = Number(item.max_score) || 100;

              return (
                <div
                  key={item.id}
                  className="bg-white border-2 border-slate-200/70 rounded-3xl p-5 shadow-sm space-y-4"
                >
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                        <Users size={18} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900">{item.student_name}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 mt-0.5 ${isFailed ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {isFailed ? <XCircle size={10} /> : <CheckCircle2 size={10} />}
                          {item.status || "ناجح"}
                        </span>
                      </div>
                    </div>

                    <div className="text-left bg-slate-900 text-white px-3 py-1.5 rounded-xl shadow-xs">
                      <span className="text-[9px] block text-indigo-300">الدرجة</span>
                      <strong className="text-sm font-black">{item.score} / {maxScoreNum}</strong>
                    </div>
                  </div>

                  {/* قسم استعراض إجابات الطالب */}
                  {item.student_answers && (
                    <div className="space-y-2">
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="w-full flex items-center justify-between p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Eye size={14} className="text-indigo-600" />
                          <span>عرض تفاصيل الإجابات والملفات</span>
                        </span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      {isExpanded && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                          {Object.keys(mcqAnswers).length > 0 && (
                            <div className="space-y-1.5">
                              <span className="font-bold text-blue-700 block border-b pb-1">أسئلة الاختيار من متعدد:</span>
                              {Object.entries(mcqAnswers).map(([qIndex, ans], i) => (
                                <div key={i} className="p-2 bg-white rounded-lg border flex items-center justify-between">
                                  <span className="text-slate-500">السؤال ({Number(qIndex) + 1})</span>
                                  <span className="font-bold text-slate-900 bg-blue-50 px-2 py-0.5 rounded">{String(ans)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {Object.keys(essayAnswers).length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="font-bold text-indigo-700 block border-b pb-1">الأسئلة المقالية:</span>
                              {Object.entries(essayAnswers).map(([qIndex, ans], i) => (
                                <div key={i} className="p-2 bg-white rounded-lg border space-y-1">
                                  <span className="text-slate-500 block">السؤال المقالي ({Number(qIndex) + 1})</span>
                                  <p className="font-medium text-slate-800 bg-slate-50 p-2 rounded">{String(ans) || "لم يكتب إجابة"}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {Object.keys(uploadedFiles).length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="font-bold text-emerald-700 block border-b pb-1">الملفات المرفقة:</span>
                              {Object.entries(uploadedFiles).map(([qIndex, fileObj]: [string, any], i) => (
                                <div key={i} className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-between">
                                  <span>ملف السؤال ({Number(qIndex) + 1})</span>
                                  <a href={fileObj.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-bold underline flex items-center gap-1">
                                    <FileText size={12} />
                                    <span>{fileObj.name}</span>
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t">
                    <span className="flex items-center gap-1">
                      <Clock size={12} className="text-amber-500" /> وقت التسليم:
                    </span>
                    <span className="font-semibold text-slate-700">{item.submission_time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="py-16 text-center space-y-3 bg-white border border-slate-200 rounded-3xl shadow-xs">
          <AlertCircle size={32} className="text-indigo-500 mx-auto" />
          <p className="text-xs sm:text-sm font-semibold text-slate-600">لا توجد اختبارات مطابقة لبحثك حالياً.</p>
        </div>
      ) : (
        /* عرض قائمة الكروت الرئيسية للاختبارات */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredQuizzes.map((quiz: any, idx: number) => (
            <div
              key={idx}
              className="bg-white border-2 border-slate-200/70 rounded-3xl p-6 shadow-sm hover:shadow-lg hover:border-indigo-500 transition-all duration-300 flex flex-col justify-between space-y-5"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black border border-indigo-100">
                    <BookOpen size={22} />
                  </div>
                  <span className="text-xs font-bold px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                    {quiz.specialty}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">{quiz.course_name}</h3>
                  <p className="text-xs text-slate-400 mt-1">معرف الاختبار: {quiz.quiz_id}</p>
                </div>

                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">الطلاب المتقدمين:</span>
                  <span className="font-black text-indigo-600 bg-white px-2.5 py-1 rounded-xl border border-slate-200">
                    {quiz.submissions.length} طالب
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedQuiz(quiz)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-95"
              >
                <Eye size={16} />
                <span>تفاصيل الاختبار والدرجات</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
