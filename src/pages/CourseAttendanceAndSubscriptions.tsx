import { useState, useEffect } from "react";
import {
  Users,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ArrowRight,
  BookOpen,
  FolderTree,
  Trash2
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

interface CourseAttendanceProps {
  userId: string;
}

export default function GradeGroupsAttendancePage({ userId }: CourseAttendanceProps) {
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  useEffect(() => {
    fetchAttendanceData();
  }, [userId]);

  // جلب البيانات من جدول تسليمات الطلاب واختباراتهم وواجباتهم
  const fetchAttendanceData = async () => {
    try {
      setLoading(true);
      // جلب التسليمات من جدول student_submissions
      const { data, error } = await supabase
        .from("student_submissions")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;

      if (data) {
        // تحويل بيانات التسليمات لتتطابق مع هيكل صفحة الحضور
        const formattedData = data.map((item) => ({
          id: item.id,
          student_id: item.student_id,
          student_name: item.student_name || "طالب بدون اسم",
          specialty: item.specialty || "عام",
          course_name: item.course_name || "كورس عام",
          attendance_status: item.attendance_status || "حاضر", // افتراضياً حاضر بمجرد تسليم الواجب/الاختبار
          attendance_time: item.submission_time || item.created_at || "-",
        }));
        setAttendanceData(formattedData);
      }
    } catch (error) {
      console.error("خطأ في جلب بيانات الحضور من التسليمات:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAttendance = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "حاضر" ? "غائب" : "حاضر";
    
    // تحديث الحالة محلياً فقط أو في قاعدة البيانات إذا كان الجدول يدعم ذلك
    setAttendanceData(prev =>
      prev.map(item => item.id === id ? { ...item, attendance_status: newStatus } : item)
    );
  };

  const handleDeleteStudent = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا السجل؟")) return;

    try {
      const { error } = await supabase
        .from("student_submissions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setAttendanceData(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("خطأ أثناء الحذف:", err);
      alert("حدث خطأ أثناء محاولة الحذف.");
    }
  };

  const specialties = Array.from(new Set(attendanceData.map(item => item.specialty)));

  const coursesForSpecialty = selectedSpecialty 
    ? Array.from(new Set(attendanceData.filter(item => item.specialty === selectedSpecialty).map(item => item.course_name)))
    : [];

  const filteredStudents = attendanceData.filter(item => {
    const matchesSpecialty = selectedSpecialty ? item.specialty === selectedSpecialty : true;
    const matchesCourse = selectedCourse ? item.course_name === selectedCourse : true;
    const matchesSearch = item.student_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSpecialty && matchesCourse && matchesSearch;
  });

  if (loading) {
    return <div className="text-center py-20 font-bold text-teal-600">جاري تحميل بيانات حضور الطلاب من الواجبات والاختبارات... 🔄</div>;
  }

  return (
    <div className="space-y-6 pb-12 bg-white text-slate-800 min-h-screen" dir="rtl">
      
      <div className="relative overflow-hidden bg-gradient-to-r from-teal-700 via-emerald-600 to-blue-700 rounded-3xl p-6 sm:p-8 shadow-xl text-white border border-teal-500/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <span className="px-3.5 py-1 bg-white/25 backdrop-blur-md text-white text-xs font-bold rounded-full inline-flex items-center gap-1.5 border border-white/30">
            <FolderTree size={13} />
            الطلاب الحاضرون عبر الواجبات والاختبارات - منصة Z E D
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-wide">
            إدارة الحضور والغياب التلقائي للطلاب
          </h1>
          <p className="text-xs sm:text-sm text-teal-100 max-w-xl leading-relaxed">
            يتم رصد حضور الطالب واحتسابه تلقائياً فور قيامه بإرسال حل الواجب أو الاختبار الخاص بالكورس.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-teal-50/60 p-4 rounded-2xl border border-teal-100 text-xs font-bold text-teal-900">
        <button 
          onClick={() => { setSelectedSpecialty(null); setSelectedCourse(null); }}
          className="hover:underline text-teal-700"
        >
          التخصصات الرئيسية
        </button>
        {selectedSpecialty && (
          <>
            <ChevronLeft size={14} className="text-teal-400" />
            <button 
              onClick={() => setSelectedCourse(null)}
              className="hover:underline text-teal-700"
            >
              {selectedSpecialty}
            </button>
          </>
        )}
        {selectedCourse && (
          <>
            <ChevronLeft size={14} className="text-teal-400" />
            <span className="text-slate-600">{selectedCourse}</span>
          </>
        )}
      </div>

      {!selectedSpecialty && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900 px-1">اختر التخصص الأكاديمي:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {specialties.map((specialty, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedSpecialty(specialty)}
                className="bg-white hover:bg-teal-50/30 border-2 border-teal-100 hover:border-teal-400 rounded-3xl p-6 cursor-pointer transition-all shadow-xs space-y-4 group flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-2xl bg-teal-50 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all">
                      <BookOpen size={24} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-900 group-hover:text-teal-700 transition-colors">
                      {specialty}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">تخصص يحتوي على تسليمات واختبارات</p>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-between text-xs font-bold text-teal-600 border-t border-slate-100">
                  <span>استعراض كورسات التخصص</span>
                  <ChevronLeft size={16} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedSpecialty && !selectedCourse && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base font-bold text-slate-900">
              كورسات تخصص {selectedSpecialty}:
            </h3>
            <button
              onClick={() => setSelectedSpecialty(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <ArrowRight size={14} />
              <span>العودة للتخصصات</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {coursesForSpecialty.map((course: any, idx: number) => (
              <div
                key={idx}
                onClick={() => setSelectedCourse(course)}
                className="bg-white hover:bg-teal-50/30 border-2 border-teal-100 hover:border-teal-400 rounded-3xl p-6 cursor-pointer transition-all shadow-xs space-y-4 group flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-2xl bg-teal-50 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all">
                      <Users size={22} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 group-hover:text-teal-700 transition-colors">
                      {course}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">انقر لمتابعة حضور الطلاب الذين حلوا الواجبات/الاختبارات</p>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-between text-xs font-bold text-teal-600 border-t border-slate-100">
                  <span>استعراض الطلاب</span>
                  <ChevronLeft size={16} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedSpecialty && selectedCourse && (
        <div className="bg-white border-2 border-teal-100 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-teal-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                طلاب كورس {selectedCourse} ({filteredStudents.length} طالباً)
              </h3>
              <span className="text-xs text-slate-500">تم رصد الحضور تلقائياً بمجرد إرسال الطالب للواجب أو الاختبار</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search size={16} className="absolute right-3.5 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ابحث باسم الطالب..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 bg-teal-50/40 border border-teal-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-teal-600"
                />
              </div>

              <button
                onClick={() => setSelectedCourse(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
              >
                <ArrowRight size={14} />
                <span>الكورسات</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStudents.map((student: any) => (
              <div
                key={student.id}
                className="bg-slate-50/80 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs hover:border-teal-300 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-xs font-bold flex items-center justify-center">
                        {student.student_id || student.id}
                      </span>
                      <h4 className="text-sm font-black text-slate-900">{student.student_name}</h4>
                    </div>
                    <button
                      onClick={() => handleDeleteStudent(student.id)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                      title="حذف السجل"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 font-semibold">حالة الحضور:</span>
                    <button
                      onClick={() => handleToggleAttendance(student.id, student.attendance_status)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs ${
                        student.attendance_status === "حاضر"
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-rose-600 hover:bg-rose-700 text-white"
                      }`}
                    >
                      {student.attendance_status === "حاضر" ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      <span>{student.attendance_status}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 pt-3 border-t border-slate-200/60 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                      <Calendar size={13} className="text-teal-600" /> وقت التسليم:
                    </span>
                    <span className="font-bold text-slate-700">{student.attendance_time || "-"}</span>
                  </div>

                  <div className="bg-teal-50/70 p-2.5 rounded-xl border border-teal-200 flex items-center justify-between text-teal-900">
                    <span className="font-semibold flex items-center gap-1 text-slate-600">
                      <Clock size={13} className="text-amber-600" /> الحالة:
                    </span>
                    <span className="font-black text-xs text-emerald-700">تم إرسال الواجب / الاختبار</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
