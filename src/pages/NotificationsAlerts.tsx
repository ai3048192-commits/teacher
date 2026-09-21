import { useState, useEffect } from "react";
import {
  Bell,
  CheckCircle2,
  Trash2,
  CheckCheck,
  PlusCircle,
  Edit3,
  ShieldAlert,
  Send,
  Loader2
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function NotificationsAlertsPage() {
  const [adminMessages, setAdminMessages] = useState<any[]>([]);
  const [myNotifications, setMyNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newCustomType, setNewCustomType] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [recipientType, setRecipientType] = useState<"students" | "admin">("students");
  const [activeTab, setActiveTab] = useState<"admin" | "my">("admin");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: adminData, error: adminError } = await supabase
        .from("sent_messages")
        .select("*")
        .order("id", { ascending: false });

      if (adminError) throw adminError;

      if (adminData) {
        const formattedAdminMsgs = adminData.map((item: any) => ({
          id: item.id,
          sender: "الإدارة / الأدمن",
          title: item.title,
          message: item.content,
          time: item.created_at ? item.created_at.split('T')[0] : "منذ وقت قصير",
          priority: "هام",
          read: item.read || false
        }));
        setAdminMessages(formattedAdminMsgs);
      }
    } catch (error) {
      console.error("خطأ في جلب البيانات:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMyNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newMessage.trim()) return;

    setActionLoading(true);
    const recipientLabel = recipientType === "students" ? "إرسال إلى الطلاب" : "إرسال إلى الأدمن";

    try {
      if (recipientType === "admin") {
        const supportPayload = {
          full_name: "تنبيه إداري / مرسل من المنصة",
          email: "admin@platform.com",
          phone: "+201000000000",
          inquiry_type: newCustomType || "تنبيه إداري",
          message: `${newTitle}: ${newMessage}`,
          date: new Date().toISOString().split("T")[0],
          time: "الآن",
          status: "pending",
          user_type: "معلم",
          priority: "عالية"
        };

        const { error: supportError } = await supabase
          .from("support_requests")
          .insert([supportPayload]);

        if (supportError) throw supportError;
      } else {
        if (editingId !== null) {
          const { error } = await supabase
            .from("my_notifications")
            .update({
              title: newTitle,
              custom_type: newCustomType,
              message: newMessage,
              recipient_type: recipientType,
              recipient_label: recipientLabel
            })
            .eq("id", editingId);

          if (error) throw error;

          setMyNotifications(
            myNotifications.map((item) =>
              item.id === editingId
                ? {
                    ...item,
                    title: newTitle,
                    custom_type: newCustomType,
                    message: newMessage,
                    recipient_type: recipientType,
                    recipient_label: recipientLabel
                  }
                : item
            )
          );
          setEditingId(null);
        } else {
          const newAlertPayload = {
            title: newTitle,
            custom_type: newCustomType || "تنبيه عام",
            message: newMessage,
            recipient_type: recipientType,
            recipient_label: recipientLabel,
            time: "الآن"
          };

          const { data, error } = await supabase
            .from("my_notifications")
            .insert([newAlertPayload])
            .select();

          if (error) throw error;

          if (data && data.length > 0) {
            setMyNotifications([data[0], ...myNotifications]);
          }
        }
      }

      setNewTitle("");
      setNewCustomType("");
      setNewMessage("");
      setRecipientType("students");
      alert(recipientType === "admin" ? "تم إرسال التنبيه إلى لوحة الأدمن بنجاح!" : "تم حفظ وإرسال التنبيه للطلاب بنجاح!");
    } catch (error: any) {
      console.error("خطأ في حفظ البيانات:", error);
      alert(`حدث خطأ أثناء الحفظ: ${error?.message || "يرجى التحقق من اتصال قاعدة البيانات"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMyNotification = async (id: number) => {
    try {
      const { error } = await supabase
        .from("my_notifications")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setMyNotifications(myNotifications.filter((item) => item.id !== id));
    } catch (error) {
      console.error("خطأ في الحذف:", error);
    }
  };

  // دالة مسح رسالة الأدمن من جدول sent_messages
  const handleDeleteAdminMessage = async (id: number) => {
    if (window.confirm("هل أنت متأكد من حذف هذه الرسالة الواردة من الأدمن؟")) {
      try {
        const { error } = await supabase
          .from("sent_messages")
          .delete()
          .eq("id", id);

        if (error) throw error;
        setAdminMessages(adminMessages.filter((msg) => msg.id !== id));
      } catch (error: any) {
        console.error("خطأ في مسح رسالة الأدمن:", error);
        alert(`حدث خطأ أثناء الحذف: ${error?.message || "تأكد من صلاحيات الحذف"}`);
      }
    }
  };

  const handleEditMyNotification = (item: any) => {
    setEditingId(item.id);
    setNewTitle(item.title);
    setNewCustomType(item.custom_type || "");
    setNewMessage(item.message);
    setRecipientType(item.recipient_type || "students");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleMarkAdminAsRead = async (id: number) => {
    try {
      const { error } = await supabase
        .from("sent_messages")
        .update({ read: true })
        .eq("id", id);

      if (error) throw error;

      setAdminMessages(
        adminMessages.map((msg) => (msg.id === id ? { ...msg, read: true } : msg))
      );
    } catch (error: any) {
      console.error("خطأ في تحديث حالة القراءة:", error);
      alert(`حدث خطأ أثناء تحديث الحالة: ${error?.message || "تأكد من إضافة عمود read في جدول sent_messages"}`);
    }
  };

  const unreadAdminCount = adminMessages.filter((m) => !m.read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 bg-white text-slate-800 min-h-screen" dir="rtl">
      
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-600 to-teal-700 rounded-3xl p-6 sm:p-8 shadow-xl text-white border border-blue-500/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <span className="px-3.5 py-1 bg-white/25 backdrop-blur-md text-white text-xs font-bold rounded-full inline-flex items-center gap-1.5 border border-white/30">
            <Bell size={13} />
            الإشعارات والرسائل الميدانية الشاملة  - منصة Z E D
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-wide">
            إدارة التنبيهات، رسائل الأدمن، والإرسال المباشر
          </h1>
          <p className="text-xs sm:text-sm text-blue-100 max-w-xl leading-relaxed">
            تستقبل هنا رسائل وتعاميم المسؤول مباشرة، وتستطيع إدارة تنبيهاتك بكل سهولة.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2 rounded-3xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("my")}
            className={`px-5 py-2 rounded-2xl text-xs font-black transition-all ${
              activeTab === "my" ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            سجلاتي وتنبيهاتي المرسلة ({myNotifications.length})
          </button>
           <button
            onClick={() => setActiveTab("admin")}
            className={`px-5 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === "admin" ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-200/60"
            }`}
          >
            <span>التنبيهات والرسائل الواردة من الأدمن</span>
            {unreadAdminCount > 0 && (
              <span className="px-2 py-0.5 bg-rose-500 text-white 
              rounded-full text-[10px] font-bold animate-pulse">
                {unreadAdminCount} جديدة
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === "admin" && (
        <div className="space-y-4">
          <h3 className="text-base font-black text-slate-900 px-1">
            رسائل وتنبيهات الأدمن الواردة ({adminMessages.length}):
          </h3>

          {adminMessages.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-3xl text-slate-400 text-sm">
              لا توجد رسائل واردة من الأدمن حالياً.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {adminMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`border-2 rounded-3xl p-6 transition-all flex flex-col justify-between space-y-4 ${
                    !msg.read ? "bg-amber-50/50 border-amber-300 shadow-md" : "bg-white border-slate-200"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200 flex items-center gap-1">
                        <ShieldAlert size={12} /> {msg.sender}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2.5 py-1 bg-rose-50 text-rose-700 rounded-xl border border-rose-200">
                          {msg.priority}
                        </span>
                        <button
                          onClick={() => handleDeleteAdminMessage(msg.id)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 flex items-center gap-1 transition-all cursor-pointer"
                          title="حذف الرسالة"
                        >
                          <Trash2 size={12} /> حذف
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-black text-slate-900">{msg.title}</h4>
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed bg-white p-3 rounded-2xl border border-slate-200">
                        {msg.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                    <span className="text-slate-400 font-semibold">{msg.time}</span>
                    {!msg.read ? (
                      <button
                        onClick={() => handleMarkAdminAsRead(msg.id)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 size={13} /> تحديد كمقروءة
                      </button>
                    ) : (
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCheck size={14} /> مقروءة
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "my" && (
        <div className="space-y-8">
          <div className={`border-2 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6 transition-all ${
            editingId !== null ? "bg-amber-50/50 border-amber-300" : "bg-slate-50 border-blue-100"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-900">
                <PlusCircle size={22} className={editingId !== null ? "text-amber-600" : "text-blue-600"} />
                <h3 className="text-base font-black">
                  {editingId !== null ? "تعديل التنبيه الخاص بك" : "كتابة تنبيه جديد وتوجيهه"}
                </h3>
              </div>
              {editingId !== null && (
                <button
                  onClick={() => {
                    setEditingId(null);
                    setNewTitle("");
                    setNewCustomType("");
                    setNewMessage("");
                    setRecipientType("students");
                  }}
                  className="text-xs font-bold text-rose-600 hover:underline"
                >
                  إلغاء التعديل
                </button>
              )}
            </div>

            <form onSubmit={handleSaveMyNotification} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">عنوان التنبيه:</label>
                  <input
                    type="text"
                    placeholder="مثال: تنبيه بخصوص موعد الاختبار"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">نوع التنبيه:</label>
                  <input
                    type="text"
                    placeholder="مثال: عاجل، واجب، إداري..."
                    value={newCustomType}
                    onChange={(e) => setNewCustomType(e.target.value)}
                    required
                    className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">إرسال إلى:</label>
                  <select
                    value={recipientType}
                    onChange={(e) => setRecipientType(e.target.value as "students" | "admin")}
                    className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                  >
                    <option value="students">الطلاب</option>
                    <option value="admin">الأدمن</option>
                  </select>
                </div>

                <div className="space-y-1.5 lg:col-span-3">
                  <label className="text-xs font-bold text-slate-700">نص الرسالة أو التنبيه:</label>
                  <textarea
                    rows={3}
                    placeholder="اكتب تفاصيل التنبيه هنا..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    required
                    className="w-full p-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`px-8 py-3.5 rounded-2xl text-xs font-black shadow-md transition-all flex items-center gap-2 text-white cursor-pointer ${
                    editingId !== null ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700"
                  } ${actionLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                  <span>{editingId !== null ? "حفظ وتحديث التنبيه" : "إرسال وحفظ التنبيه فوراً"}</span>
                </button>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            <h3 className="text-base font-black text-slate-900 px-1">
              سجلات التنبيهات الخاصة بك ({myNotifications.length}):
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myNotifications.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border-2 border-slate-200 hover:border-blue-300 rounded-3xl p-6 shadow-xs space-y-4 flex flex-col justify-between transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                        {item.custom_type}
                      </span>
                      
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleEditMyNotification(item)}
                          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-xs font-bold border border-amber-200 flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Edit3 size={12} /> تعديل
                        </button>
                        <button
                          onClick={() => handleDeleteMyNotification(item.id)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Trash2 size={12} /> حذف
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-black text-slate-900">{item.title}</h4>
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-200">
                        {item.message}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-3 border-t border-slate-100 text-xs font-semibold text-slate-600">
                    <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Send size={12} className="text-blue-600" /> جهة الاستقبال:
                      </span>
                      <span className="font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                        {item.recipient_label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>وقت الإرسال:</span>
                      <span className="font-bold">{item.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}