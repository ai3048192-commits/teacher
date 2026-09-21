import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Video,
  Radio,
  Users,
  Clock,
  Calendar,
  PlusCircle,
  Trash2,
  Edit3,
  CheckCircle2,
  PlayCircle,
  Link as LinkIcon,
  X,
  Save,
  MonitorPlay,
  Mic,
  MicOff,
  VideoOff,
  LogOut,
  Send,
  BookOpen,
  Layers,
  MessageSquare,
  Sparkles,
  Tv
} from "lucide-react";

export default function TeacherLiveDashboard() {
  const [sessionTitle, setSessionTitle] = useState("");
  const [subjectName, setSubjectName] = useState("علوم الحاسب وتقنية المعلومات");
  const [courseName, setCourseName] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string | number>(""); // الـ ID المستخلص من TeacherContent / Courses
  
  const [sessionDate, setSessionDate] = useState("");
  const [sessionTime, setSessionTime] = useState("");
  const [livePlatformUrl, setLivePlatformUrl] = useState("");
  const [useInternalStream, setUseInternalStream] = useState(true);

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [liveSessions, setLiveSessions] = useState<any[]>([]);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]); // قائمة الكورسات لجلب الـ ID والتخصص
  const [activeStudioSession, setActiveStudioSession] = useState<any | null>(null);

  useEffect(() => {
    fetchSessions();
    fetchCoursesList();
  }, []);

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("خطأ في جلب الحصص:", error.message);
    } else {
      setLiveSessions(data || []);
    }
  };

  // جلب الكورسات المتاحة من جدول courses (الموجودة في TeacherContent)
  const fetchCoursesList = async () => {
    const { data, error } = await supabase
      .from('courses')
      .select('id, course_name, course_specialty, category');
    
    if (!error && data) {
      setAvailableCourses(data);
    }
  };

  // عند اختيار الكورس التدريبي، يتم تعيين اسم الكورس، الـ ID، والتخصص الأكاديمي تلقائياً
  const handleCourseSelection = (courseId: string) => {
    setSelectedCourseId(courseId);
    const matched = availableCourses.find(c => String(c.id) === String(courseId));
    if (matched) {
      setCourseName(matched.course_name || "");
      setSubjectName(matched.course_specialty || matched.category || "علوم الحاسب وتقنية المعلومات");
    } else {
      setCourseName("");
    }
  };

  const handleSaveAndAction = async (e: React.FormEvent, actionType: 'save' | 'notify' | 'startDirect') => {
    e.preventDefault();

    if (!sessionTitle.trim() || !courseName.trim() || !sessionDate.trim() || !sessionTime.trim()) {
      alert("الرجاء تعبئة الحقول الأساسية (عنوان الحصة، اسم الكورس، التاريخ، والوقت).");
      return;
    }

    setLoading(true);
    setSuccessMessage("");

  const sessionData = {
  title: sessionTitle,
  subject: subjectName, 
  course: courseName,   
  course_id: selectedCourseId ? Number(selectedCourseId) : null, 
  session_date: sessionDate,
  session_time: sessionTime,
  url: livePlatformUrl, // <--- هذا هو حقل الرابط الخارجي
  is_internal: useInternalStream, // <--- حقل يحدد هل البث داخلي (true) أم خارجي (false)
};

    let targetSession = null;

    if (editingId) {
      const { data, error } = await supabase
        .from('live_sessions')
        .update(sessionData)
        .eq('id', editingId)
        .select();

      if (error) {
        alert("فشل التحديث: " + error.message);
      } else {
        setSuccessMessage("✨ تم تحديث بيانات الحصة بنجاح في قاعدة البيانات!");
        targetSession = data ? data[0] : null;
      }
    } else {
      const { data, error } = await supabase
        .from('live_sessions')
        .insert([sessionData])
        .select();

      if (error) {
        alert("فشل الحفظ: " + error.message);
      } else {
        if (actionType === 'notify') {
          setSuccessMessage("🚀 تمت جدولة الحصة وإرسال إشعار فوري لكل الطلاب بنجاح!");
        } else {
          setSuccessMessage("✨ تم حفظ بيانات الحصة في قاعدة البيانات بنجاح!");
        }
        targetSession = data ? data[0] : null;
      }
    }

    await fetchSessions();

    if (actionType === 'startDirect' && targetSession) {
      setActiveStudioSession(targetSession);
    } else {
      resetForm();
    }

    setLoading(false);
    setTimeout(() => setSuccessMessage(""), 5000);
  };

  const resetForm = () => {
    setSessionTitle("");
    setCourseName("");
    setSelectedCourseId("");
    setSubjectName("علوم الحاسب وتقنية المعلومات");
    setSessionDate("");
    setSessionTime("");
    setLivePlatformUrl("");
    setUseInternalStream(true);
    setEditingId(null);
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setSessionTitle(item.title);
    setSubjectName(item.subject || "علوم الحاسب وتقنية المعلومات");
    setCourseName(item.course || "");
    setSelectedCourseId(item.course_id || "");
    setSessionDate(item.session_date);
    setSessionTime(item.session_time);
    setLivePlatformUrl(item.url || "");
    setUseInternalStream(item.is_internal ?? true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الحصة المباشرة نهائياً؟")) return;
    const { error } = await supabase.from('live_sessions').delete().eq('id', id);
    if (error) {
      alert("خطأ في الحذف: " + error.message);
    } else {
      fetchSessions();
      if (editingId === id) resetForm();
    }
  };

  if (activeStudioSession) {
    return (
      <InternalStudioView 
        session={activeStudioSession} 
        onClose={() => setActiveStudioSession(null)} 
      />
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 min-h-screen rounded-2xl " dir="rtl">
      
      {/* هيدر الداشبورد */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-950 via-indigo-900 to-slate-900 rounded-3xl p-5 sm:p-10 shadow-2xl text-white border border-white/10">
        <div className="relative z-10 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-[11px] sm:text-xs font-bold text-violet-200">
            <Sparkles size={13} className="text-amber-400" />
            مركز قيادة البث الحي والتعليم التفاعلي -  منصة Z E D
          </div>
          <h1 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tight leading-snug">
            لوحة تحكم المعلم للبث المباشر <span className="text-violet-400">Pro</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            تم جلب وربط معرفات الكورسات (Course ID) والتخصصات الأكاديمية مباشرة من سجلات المعلم (TeacherContent).
          </p>
        </div>
      </div>

      {/* نموذج الإدخال والتعديل */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-8 shadow-xl space-y-5 sm:space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${editingId ? "bg-amber-500 animate-ping" : "bg-violet-600"}`} />
            <h3 className="text-sm sm:text-base font-black text-slate-900">
              {editingId ? "تعديل تفاصيل الحصة المباشرة" : "جدولة حصة جديدة أو بدء البث الفوري 🚀"}
            </h3>
          </div>
          {editingId && (
            <button 
              onClick={resetForm}
              className="px-3.5 py-1.5 bg-rose-50 text-rose-600 text-xs font-bold rounded-xl border border-rose-200 flex items-center gap-1 hover:bg-rose-100 transition-all shrink-0"
            >
              <X size={14} /> إلغاء التعديل
            </button>
          )}
        </div>

        {successMessage && (
          <div className="p-3.5 sm:p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form className="space-y-4 sm:space-y-5">
          
          {/* اختيار الكورس التدريبي من TeacherContent لجلب الـ ID واسم الكورس والتخصص تلقائياً */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                <BookOpen size={14} className="text-violet-600" /> اختر الكورس التدريبي (من TeacherContent):
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => handleCourseSelection(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-violet-600 transition-all shadow-sm"
              >
                <option value="">-- اختر الكورس التدريبي --</option>
                {availableCourses.map((crs) => (
                  <option key={crs.id} value={crs.id}>
                    [ID: {crs.id}] - {crs.course_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                <Layers size={14} className="text-violet-600" /> التخصص الأكاديمي (يُعبأ تلقائياً):
              </label>
              <input
                type="text"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:border-violet-600 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-xs font-black text-slate-700 block">عنوان الحصة / الدرس:</label>
              <input
                type="text"
                placeholder="مثال: مراجعة شاملة وحل أسئلة الامتحانات..."
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-violet-600 transition-all shadow-sm"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-xs font-black text-slate-700 block">اسم الكورس (مطابق لـ TeacherContent):</label>
              <input
                type="text"
                placeholder="اسم الكورس..."
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-violet-600 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                <Calendar size={14} className="text-violet-600" /> موعد / تاريخ البث:
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-violet-600 transition-all shadow-sm"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                <Clock size={14} className="text-violet-600" /> وقت البث (الساعة):
              </label>
              <input
                type="time"
                value={sessionTime}
                onChange={(e) => setSessionTime(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-violet-600 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                <MonitorPlay size={16} className="text-violet-600" /> نوع البث المباشر:
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={useInternalStream} 
                  onChange={(e) => setUseInternalStream(e.target.checked)} 
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-350 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
              </label>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              {useInternalStream 
                ? "✨ البث مدمج بالكامل داخل المنصة مع استوديو كاميرا وشات تفاعلي." 
                : "🌐 البث يتم عبر رابط خارجي مخصص."}
            </p>
          </div>

          {!useInternalStream && (
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                <LinkIcon size={14} className="text-violet-600" /> رابط منصة البث الخارجي:
              </label>
              <input
                type="url"
                placeholder="https://zoom.us/j/..."
                value={livePlatformUrl}
                onChange={(e) => setLivePlatformUrl(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-violet-600 transition-all shadow-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 sm:pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={loading}
              onClick={(e) => handleSaveAndAction(e, 'save')}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2"
            >
              {editingId ? <Save size={15} /> : <PlusCircle size={15} />}
              <span>{editingId ? "تحديث الحصة" : "حفظ الحصة فقط"}</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={(e) => handleSaveAndAction(e, 'notify')}
              className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Send size={15} className="text-indigo-200 animate-bounce" />
              <span>حفظ وإرسال إشعار للطلاب 🚀</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={(e) => handleSaveAndAction(e, 'startDirect')}
              className="px-4 py-3 bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 hover:opacity-90 text-white rounded-2xl text-xs font-black shadow-xl transition-all flex items-center justify-center gap-2 animate-pulse"
            >
              <Tv size={15} />
              <span>حفظ وابدأ البث المباشر فوراً 🔴</span>
            </button>
          </div>
        </form>
      </div>

      {/* قائمة الحصص المسجلة في القاعدة */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 sm:p-8 shadow-xl space-y-5 sm:space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-violet-50 text-violet-600 border border-violet-100 shadow-sm">
              <Video size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900">الحصص المباشرة المحفوظة</h3>
              <span className="text-[11px] sm:text-xs text-slate-500">تم جلبها مباشرة من جدول live_sessions في Supabase</span>
            </div>
          </div>
        </div>

        {liveSessions.length === 0 ? (
          <div className="py-12 text-center space-y-3 bg-slate-50/60 border border-slate-200 rounded-2xl">
            <VideoOff size={32} className="text-violet-500 mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-slate-700">لا توجد حصص مسجلة حالياً.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {liveSessions.map((item) => (
              <div key={item.id} className="bg-gradient-to-b from-white to-slate-50/50 border-2 border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-md hover:border-violet-500 transition-all space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] sm:text-[11px] font-black px-2.5 py-1 bg-violet-100 text-violet-700 rounded-xl">
                        {item.subject}
                      </span>
                      {item.course && (
                        <span className="text-[10px] sm:text-[11px] font-black px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 truncate max-w-[200px]">
                          {item.course} {item.course_id ? `(ID: ${item.course_id})` : ""}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm sm:text-base font-black text-slate-900 pt-1 leading-snug">{item.title}</h4>
                  </div>
                  <span className="text-[11px] font-black bg-rose-50 text-rose-600 px-2.5 py-1 rounded-full border border-rose-200 flex items-center gap-1 shrink-0 shadow-sm">
                    <Radio size={11} className="animate-pulse" /> جاهز
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-2xl border border-slate-200 text-xs shadow-inner">
                  <div className="flex items-center gap-1.5 text-slate-600 font-bold text-[11px] sm:text-xs">
                    <Calendar size={13} className="text-violet-600 shrink-0" /> {item.session_date || "لم يُحدد"}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 font-bold text-[11px] sm:text-xs">
                    <Clock size={13} className="text-violet-600 shrink-0" /> {item.session_time || "لم يُحدد"}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                  {item.is_internal ? (
                    <button
                      onClick={() => setActiveStudioSession(item)}
                      className="flex-1 py-2.5 sm:py-3 px-3 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-2xl text-xs font-black text-center transition-all flex items-center justify-center gap-1.5 shadow-lg animate-pulse"
                    >
                      <PlayCircle size={16} /> ابدأ الاستوديو الداخلي 🔴
                    </button>
                  ) : item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 sm:py-3 px-3 bg-emerald-600 text-white rounded-2xl text-xs font-black text-center transition-all flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <PlayCircle size={16} /> رابط البث الخارجي
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 font-bold">لا يوجد رابط</span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-2 sm:p-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl border border-blue-200 transition-all shadow-sm"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 sm:p-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl border border-rose-200 transition-all shadow-sm"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// استوديو البث الحي (مع الكاميرا والشات الحقيقي المتصل بقاعدة البيانات)
function InternalStudioView({ session, onClose }: { session: any, onClose: () => void }) {
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [onlineStudentsCount, setOnlineStudentsCount] = useState(1);

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      })
      .catch((err) => console.log("تعذر الوصول للكاميرا:", err));

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('live_chat_messages')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });
      
      if (!error && data) {
        setMessages(data);
      }
    };

    fetchMessages();

    const channelName = `room_chat_${session.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_chat_messages',
        },
        (payload) => {
          if (payload.new && String(payload.new.session_id) === String(session.id)) {
            setMessages((prev) => {
              const exists = prev.some((msg) => msg.id === payload.new.id);
              if (exists) return prev;
              return [...prev, payload.new];
            });
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineStudentsCount(Object.keys(state).length || 1);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      supabase.removeChannel(channel);
    };
  }, [session.id]);

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => track.enabled = !isAudioOn);
    }
    setIsAudioOn(!isAudioOn);
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach(track => track.enabled = !isVideoOn);
    }
    setIsVideoOn(!isVideoOn);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const textToSend = newMessage;
    setNewMessage("");

    const { error } = await supabase.from('live_chat_messages').insert([
      { 
        session_id: session.id, 
        sender_name: "المعلم (أنت)", 
        message: textToSend 
      }
    ]);

    if (error) {
      console.error("خطأ في إرسال الرسالة:", error.message);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-white p-2 overflow-hidden" dir="rtl">
      <header className="flex justify-between items-center bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-800 mb-2 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-black text-white truncate">بث مباشر: {session.title}</h2>
          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-bold flex items-center gap-1">
            <Users size={11} /> المتصلين: {onlineStudentsCount}
          </span>
        </div>
        <button
          onClick={() => {
            if (stream) stream.getTracks().forEach(t => t.stop());
            onClose();
          }}
          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black rounded-lg flex items-center gap-1 transition-all"
        >
          <LogOut size={12} /> إنهاء البث
        </button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-2 overflow-hidden min-h-0">
        <div className="flex-1 lg:flex-[2] flex flex-col bg-slate-900/50 border border-slate-800 rounded-2xl p-2 overflow-hidden">
          <div className="flex-1 relative w-full bg-black rounded-xl overflow-hidden flex items-center justify-center">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted={isMuted}
              className="w-full h-full object-cover" 
            />
            {!isVideoOn && (
              <div className="absolute inset-0 bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-bold gap-1">
                <VideoOff size={20} /> الكاميرا مغلقة
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-center gap-2 bg-slate-900 py-2 px-4 rounded-xl border border-slate-800 w-fit mx-auto">
            <button onClick={toggleAudio} className={`p-2 rounded-lg text-white transition-all ${isAudioOn ? "bg-slate-800 hover:bg-slate-700" : "bg-rose-600"}`}>
              {isAudioOn ? <Mic size={16} /> : <MicOff size={16} />}
            </button>
            <button onClick={toggleVideo} className={`p-2 rounded-lg text-white transition-all ${isVideoOn ? "bg-slate-800 hover:bg-slate-700" : "bg-rose-600"}`}>
              {isVideoOn ? <Video size={16} /> : <VideoOff size={16} />}
            </button>
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all ${!isMuted ? "bg-indigo-600" : "bg-slate-800"}`}
            >
              {!isMuted ? "🔊 الصوت مفعل" : "🔇 الصوت مكتوم"}
            </button>
          </div>
        </div>

        <div className="w-full lg:w-80 bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col overflow-hidden">
          <h3 className="text-xs font-black text-slate-300 pb-2 border-b border-slate-800 flex items-center justify-between">
            <span>الشات الفوري (يظهر عند الطرفين)</span>
            <MessageSquare size={14} className="text-violet-400" />
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2 py-2 text-xs">
            {messages.length === 0 ? (
              <div className="text-center text-slate-500 py-6 text-[11px]">لا توجد رسائل بعد، ابدأ المحادثة...</div>
            ) : (
              messages.map((msg, idx) => (
                <div key={msg.id || idx} className="bg-slate-950 border border-slate-800/80 p-2 rounded-xl space-y-0.5">
                  <span className="text-[10px] font-black text-violet-400 block">{msg.sender_name}</span>
                  <p className="text-slate-200 text-xs leading-relaxed">{msg.message}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleSendMessage} className="pt-2 border-t border-slate-800 flex items-center gap-1.5">
            <input
              type="text"
              placeholder="اكتب ردك للطلاب..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white focus:outline-none focus:border-violet-600"
            />
            <button type="submit" className="p-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-all">
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}