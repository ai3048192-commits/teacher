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
  Trash2,
  History
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

  // جلب البيانات وتجميعها بحيث يظهر الطالب مرة واحدة (حسب أول محاولة/تسليم)
  const fetchAttendanceData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("student_submissions")
        .select("*")
        .order("created_at", { ascending: true }); // ترتيب تصاعدي لنصل للأولى أولاً

      if (error) throw error;

      if (data) {
        // تجميع التسليمات بحيث يكون لكل طالب سجل واحد فريد لكل (كورس + تخصص + طالب)
        const studentMap = new Map();

        data.forEach((item) => {
          const studentId = item.student_id || item.id;
          const specialty = item.specialty || "عام";
          const courseName = item.course_name || "كورس عام";
          
          // مفتاح فريد للطالب داخل الكورس والتخصص
          const uniqueKey = `${specialty}_${courseName}_${studentId}`;

          if (!studentMap.has(uniqueKey)) {
            // هذه هي المحاولـة الأولى (الأقدم)
            studentMap.set(uniqueKey, {
              id: item.id, // معرف السجل الأول
              allIds: [item.id], // لحفظ جميع معرفات محاولاته إذا أردنا حذفها لاحقاً
              student_id: studentId,
              student_name: item.student_name || "طالب بدون اسم",
              specialty: specialty,
              course_name: courseName,
              attendance_status: item.attendance_status || "حاضر",
              first_attendance_time: item.submission_time || item.created_at || "-",
              attempts_count: 1,
            });
          } else {
            // إذا كان الطالب موجوداً مسبقاً، نزيد عدد محاولاته فقط ونحافظ على وقت المحاولة الأولى
            const existing = studentMap.get(uniqueKey);
            existing.attempts_count += 1;
            existing.allIds.push(item.id);
          }
        });

        setAttendanceData(Array.from(studentMap.values()));
      }
    } catch (error) {
      console.error("خطأ في جلب بيانات الحضور:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAttendance = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "حاضر" ? "غائب" : "حاضر";
    
    setAttendanceData(prev =>
      prev.map(item => item.id === id ? { ...item, attendance_status: newStatus } : item)
    );
  };

  const handleDeleteStudent = async (studentItem: any) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الطالب وجميع محاولاته المسجلة في هذا الكورس؟")) return;

    try {
      // حذف كل السجلات الخاصة بهذا الطالب في هذا الكورس بناءً على المعرفات المخزنة
      const { error } = await supabase
        .from("student_submissions")
        .delete()
        .in("id", studentItem.allIds);

      if (error) throw error;

      setAttendanceData(prev => prev.filter(item => item.id !== studentItem.id));
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
    return <div className="text-center py-20 font-bold text-teal-600">جاري تحميل سجلات حضور الطلاب... 🔄</div>;
  }

  return (
    <div className="space-y-6 pb-12 bg-white text-slate-800 min-h-screen" dir="rtl">
      
      {/* رأس الصفحة */}
      <div className="relative overflow-hidden bg-gradient-to-r from-teal-700 via-emerald-600 to-blue-700 rounded-3xl p-6 sm:p-8 shadow-xl text-white border border-teal-500/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <span className="px-3.5 py-1 bg-white/25 backdrop-blur-md text-white text-xs font-bold rounded-full inline-flex items-center gap-1.5 border border-white/30">
            <FolderTree size={13} />
            سجل الحضور بناءً على المحاولة الأولى - منصة Z E D
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-wide">
            إدارة الحضور والغياب (المحاولة الأولى)
          </h1>
          <p className="text-xs sm:text-sm text-teal-100 max-w-xl leading-relaxed">
            يتم رصد دخول الطالب واحتساب حضوره بناءً على أول محاولة أو تسليم قام به في الامتحان أو الواجب.
          </p>
        </div>
      </div>

      {/* شريط التنقل المتسلسل */}
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

      {/* عرض التخصصات */}
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
                    <p className="text-xs text-slate-500 mt-1">تخصص يحتوي على سجلات حضور الطلاب</p>
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

      {/* عرض الكورسات */}
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
                    <p className="text-xs text-slate-500 mt-1">انقر لمتابعة حضور الطلاب بناءً على أول محاولة</p>
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

      {/* عرض قائمة الطلاب الفريدة (مرة واحدة لكل طالب) */}
      {selectedSpecialty && selectedCourse && (
        <div className="bg-white border-2 border-teal-100 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-teal-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                طلاب كورس {selectedCourse} ({filteredStudents.length} طالباً فريداً)
              </h3>
              <span className="text-xs text-slate-500">تم رصد الحضور من تاريخ الدخول والمحاولة الأولى</span>
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
                        {student.student_id}
                      </span>
                      <h4 className="text-sm font-black text-slate-900">{student.student_name}</h4>
                    </div>
                    <button
                      onClick={() => handleDeleteStudent(student)}
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
                      <Calendar size={13} className="text-teal-600" /> أول محاولة (الدخول):
                    </span>
                    <span className="font-bold text-slate-700">{student.first_attendance_time || "-"}</span>
                  </div>

                  <div className="bg-teal-50/70 p-2.5 rounded-xl border border-teal-200 flex items-center justify-between text-teal-900">
                    <span className="font-semibold flex items-center gap-1 text-slate-600">
                      <History size={13} className="text-amber-600" /> عدد المحاولات:
                    </span>
                    <span className="font-black text-xs text-teal-800">{student.attempts_count} محاولات مسجلة</span>
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
