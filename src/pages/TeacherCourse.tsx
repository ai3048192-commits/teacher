import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  PlusCircle,
  Search,
  Filter,
  Users,
  Calendar,
  Edit3,
  BookMarked,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Tag,
  PlayCircle,
  DollarSign,
  FolderArchive,
  Download
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function TeacherCoursesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("الكل");
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // حالة للتحكم في فتح/إغلاق قائمة الفيديوهات داخل كل كارت
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  // حالة للتحكم في فتح/إغلاق قائمة الملفات والمستندات داخل كل كارت
  const [expandedFilesId, setExpandedFilesId] = useState<number | null>(null);

  // دالة لجلب الكورسات والملفات المرتبطة بها من قاعدة البيانات
  const fetchSupabaseCourses = async () => {
    try {
      setLoading(true);
      
      // جلب الكورسات والملفات بشكل متزامن من جدول courses و course_files[cite: 4, 5]
      const { data: coursesData, error: coursesError } = await supabase.from("courses").select("*").order("id", { ascending: false });
      const { data: filesData, error: filesError } = await supabase.from("course_files").select("*");
      
      if (coursesError) throw coursesError;

      if (coursesData) {
        const formattedSupabaseCourses = coursesData.map((item: any) => {
          // تصفية الملفات الخاصة بهذا الكورس بناءً على مطابقة اسم الكورس[cite: 5]
          const matchedFiles = filesData ? filesData.filter((file: any) => file.course_name === item.course_name) : [];

          let displayPrice = "مجاني بالكامل";
          if (!item.is_free) {
            displayPrice = item.price !== null && item.price !== undefined && item.price !== "" 
              ? `${item.price} ج.م` 
              : "مدفوع برسوم";
          }

          return {
            id: item.id,
            courseName: item.course_name || "بدون اسم",
            category: item.course_specialty || "عام",
            courseDesc: item.description || "لا يوجد وصف مضاف لهذا الكورس حالياً.",
            studentsCount: item.students_count || 0,
            lessonsCount: item.video_count || 0,
            nextSession: item.show_times || "مفتوح دائماً",
            status: item.status === "active" ? "نشط ومتاح" : "قريباً",
            price: displayPrice,
            rawPrice: item.price,
            isFree: item.is_free,
            videosList: item.videos_list || [],
            filesList: matchedFiles, // إدراج الملفات العامة هنا
          };
        });

        setCourses(formattedSupabaseCourses);
      }
    } catch (err: any) {
      console.error("Error fetching courses from Supabase:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupabaseCourses();

    const channel = supabase
      .channel("public:courses_and_files")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "courses" },
        () => {
          fetchSupabaseCourses();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "course_files" },
        () => {
          fetchSupabaseCourses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const categories = [
    "الكل",
    ...Array.from(new Set(courses.map((course) => course.category))),
  ];

  const filteredCourses = courses.filter((course) => {
    const matchesSearch =
      course.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "الكل" || course.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 text-slate-800 min-h-screen " dir="rtl">
      
      {/* 1. رأس الصفحة الاحترافي */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-800 via-blue-800 to-slate-900 rounded-3xl p-6 sm:p-10 shadow-2xl text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="px-3.5 py-1.5 bg-white/20 backdrop-blur-md text-white text-xs font-bold rounded-full inline-flex items-center gap-1.5 border border-white/30 shadow-sm">
              <Sparkles size={14} />
              منصة إدارة محتوى المعلم -  منصة Z E D
            </span>
            <h1 className="text-2xl sm:text-4xl font-black tracking-wide">
              إدارة وعرض الكورسات المُضافة من الفورم
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 max-w-xl leading-relaxed">
              تتم مزامنة الكورسات، الفيديوهات، والملفات العامة لحظياً مع قاعدة البيانات وباقي صفحات المنصة.
            </p>
          </div>

          <Link
            to="/teacher/content"
            className="flex items-center justify-center gap-2 px-6 py-4 bg-white hover:bg-blue-50 text-indigo-700 font-black text-xs sm:text-sm rounded-2xl transition-all shadow-xl hover:scale-105 shrink-0"
          >
            <PlusCircle size={18} />
            <span>إضافة كورس أو ملفات عبر الفورم</span>
          </Link>
        </div>
      </div>

      {/* 2. شريط البحث والفلتر المتطور */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="relative w-full lg:w-96">
          <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-indigo-600" />
          <input
            type="text"
            placeholder="ابحث باسم الكورس أو التخصص..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-11 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-600 transition-all shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0">
          <Filter size={16} className="text-indigo-600 ml-1 hidden sm:block" />
          {categories.map((cat, index) => (
            <button
              key={index}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${
                selectedCategory === cat
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md scale-105"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 3. شبكة الكروت بتصميم فخم ومطور */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs font-bold">
          جاري جلب الكورسات والملفات والمستندات من قاعدة البيانات...
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="py-16 text-center space-y-3 bg-white border border-slate-200 rounded-3xl shadow-sm">
          <BookMarked size={36} className="text-indigo-500 mx-auto" />
          <h3 className="text-sm font-black text-slate-800">
            لا توجد كورسات مطابقة لبحثك أو الفلتر المحدد
          </h3>
          <p className="text-xs text-slate-400">
            قم بإضافة كورس جديد أو ملفات عامة عبر نموذج الإدخال (الفورم) لتظهر هنا بجميع تفاصيلها.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => {
            const isExpanded = expandedCardId === course.id;
            const isFilesExpanded = expandedFilesId === course.id;

            return (
              <div
                key={course.id}
                className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 flex flex-col justify-between group"
              >
                {/* ترويسة الكارت العلوية */}
                <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white relative overflow-hidden">
                  <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="flex items-center justify-between mb-3 relative z-10 gap-2">
                    <span className="px-3 py-1 bg-indigo-600/40 backdrop-blur-md text-[11px] font-black rounded-xl border border-indigo-400/30 text-cyan-300 shadow-2xs flex items-center gap-1">
                      <Tag size={12} /> {course.category}
                    </span>
                    <span className={`px-2.5 py-1 text-[10px] font-black rounded-xl border flex items-center gap-1 ${course.isFree ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30' : 'bg-amber-950/80 text-amber-300 border-amber-500/30'}`}>
                      {!course.isFree && <DollarSign size={10} />}
                      {course.price}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-black line-clamp-2 relative z-10 leading-snug tracking-wide text-white mt-2">
                    {course.courseName}
                  </h3>
                </div>

                {/* محتوى وتفاصيل الكارت */}
                <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3.5">
                    
                    {/* إحصائيات سريعة (الطلاب والفيديوهات) */}
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70 flex flex-col items-center justify-center space-y-0.5">
                        <Users size={16} className="text-indigo-600" />
                        <span className="text-slate-400 text-[10px] font-bold">الطلاب المسجلون</span>
                        <strong className="text-slate-800 font-black text-xs">{course.studentsCount} طالب</strong>
                      </div>
                      
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70 flex flex-col items-center justify-center space-y-0.5">
                        <PlayCircle size={16} className="text-indigo-600" />
                        <span className="text-slate-400 text-[10px] font-bold">عدد الفيديوهات</span>
                        <strong className="text-indigo-600 font-black text-xs">{course.lessonsCount} فيديو</strong>
                      </div>
                    </div>

                    {/* مواعيد العرض */}
                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200/70 text-xs">
                      <span className="flex items-center gap-1.5 text-slate-500 font-bold">
                        <Calendar size={14} className="text-indigo-600" /> مواعيد العرض:
                      </span>
                      <strong className="text-slate-800 font-black">{course.nextSession}</strong>
                    </div>

                    {/* الوصف أو النبذة */}
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70 space-y-1">
                      <span className="text-slate-400 font-bold text-[10px] block">نبذة عن الكورس:</span>
                      <p className="text-slate-700 text-xs font-bold line-clamp-2 leading-relaxed">
                        {course.courseDesc}
                      </p>
                    </div>

                    {/* قائمة تفاصيل الفيديوهات (Accordion) */}
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setExpandedCardId(isExpanded ? null : course.id)}
                        className="w-full py-2.5 px-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl text-xs font-black transition-all flex items-center justify-between border border-indigo-200/80 shadow-2xs"
                      >
                        <span className="flex items-center gap-1.5">
                          <PlayCircle size={15} />
                          <span>عرض عناوين الفيديوهات ({course.videosList.length})</span>
                        </span>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {isExpanded && (
                        <div className="space-y-2 pt-1 max-h-48 overflow-y-auto pr-1 animate-fadeIn">
                          {course.videosList && course.videosList.length > 0 ? (
                            course.videosList.map((vid: any, idx: number) => (
                              <div key={idx} className="bg-slate-900 text-white p-3 rounded-xl border border-slate-800 space-y-1 text-xs shadow-inner">
                                <div className="flex items-center justify-between">
                                  <span className="text-cyan-400 font-black">الدرس {idx + 1}: {vid.title}</span>
                                  <span className="text-[9px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30">
                                    {vid.inputType === "url" ? "رابط خارجي" : "ملف مرفق"}
                                  </span>
                                </div>
                                <p className="text-slate-400 text-[10px] truncate">{vid.mediaUrl || vid.fileName}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400 text-center py-2 bg-slate-50 rounded-xl border border-slate-100">
                              لا توجد محاضرات مسجلة في هذا الكورس.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* قائمة الملفات والمستندات العامة القادمة من تبويب الملفات */}
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setExpandedFilesId(isFilesExpanded ? null : course.id)}
                        className="w-full py-2.5 px-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-2xl text-xs font-black transition-all flex items-center justify-between border border-emerald-200/80 shadow-2xs"
                      >
                        <span className="flex items-center gap-1.5">
                          <FolderArchive size={15} />
                          <span>الملفات والمستندات العامة ({course.filesList.length})</span>
                        </span>
                        {isFilesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {isFilesExpanded && (
                        <div className="space-y-2 pt-1 max-h-48 overflow-y-auto pr-1 animate-fadeIn">
                          {course.filesList && course.filesList.length > 0 ? (
                            course.filesList.map((fileGroup: any, fIdx: number) => (
                              <div key={fIdx} className="bg-slate-900 text-white p-3 rounded-xl border border-slate-800 space-y-2 text-xs shadow-inner">
                                <div className="flex items-center justify-between">
                                  <span className="text-emerald-400 font-black">{fileGroup.title}</span>
                                  <span className="text-[9px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                                    {fileGroup.files_info?.length || 0} ملف
                                  </span>
                                </div>
                                {fileGroup.description && (
                                  <p className="text-slate-400 text-[10px]">{fileGroup.description}</p>
                                )}
                                <div className="space-y-1 pt-1 border-t border-slate-800">
                                  {fileGroup.files_info?.map((file: any, subIdx: number) => (
                                    <div key={subIdx} className="flex items-center justify-between text-[11px] bg-slate-800/80 p-2 rounded-lg">
                                      <span className="text-slate-200 truncate max-w-[140px]">{file.name}</span>
                                      {file.data && (
                                        <a 
                                          href={file.data} 
                                          download={file.name} 
                                          className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-all flex items-center gap-1"
                                          title="تحميل الملف"
                                        >
                                          <Download size={12} />
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400 text-center py-2 bg-slate-50 rounded-xl border border-slate-100">
                              لا توجد ملفات عامة مرفوعة لهذا الكورس.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* زر التعديل */}
                  <div className="pt-4 border-t border-slate-100 flex items-center">
                    <Link
                      to="/teacher/content"
                      className="w-full flex items-center justify-center gap-1.5 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black transition-all shadow-md hover:shadow-lg"
                    >
                      <Edit3 size={15} />
                      <span>تعديل محتوى الكورس أو رفع ملفات</span>
                    </Link>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}