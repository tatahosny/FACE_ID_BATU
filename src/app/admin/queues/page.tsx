"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import {
  RefreshCw,
  Search,
  Volume2,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  Folder,
  Radio,
  UserCheck,
} from "lucide-react";

export default function AdminQueuesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [sessionUser, setSessionUser] = useState<any>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.user) setSessionUser(j.data.user);
      })
      .catch(() => {});
  }, []);

  const isSuperAdmin = sessionUser?.role === "SUPER_ADMIN";

  const fetchQueues = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/queues?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data.items) {
        setItems(json.data.items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueues();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQueues();
  };

  const handleAction = async (action: string, bookingId: string, studentId?: string) => {
    try {
      setActionLoading(`${action}_${bookingId}`);
      setFeedback(null);

      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, bookingId, studentId }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل تنفيذ الإجراء", type: "error" });
        return;
      }

      setFeedback({
        message:
          action === "activate"
            ? "تم تفعيل بصمة الطالب بنجاح وإرسال إشعار التيليجرام فوراً! تم إنهاء دوره وإزالته من شاشة الطابور، وهو موثق الآن في «دليل الطلاب» بحالة مفعلة."
            : json.message || "تم تنفيذ الإجراء بنجاح",
        type: "success",
      });
      await fetchQueues();
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const [resetLoading, setResetLoading] = useState(false);

  const handleResetAllTickets = async () => {
    if (
      !confirm(
        "تحذير هام (نهاية اليوم):\nهل أنت متأكد من رغبتك في تصفير أرقام التذاكر لتبدأ من أول 1 لجميع سكاشن المنظومة بالكامل؟\nسيتم مسح سجلات طابور الانتظار الحالي وإعادة تعيين عداد التذاكر ليبدأ من 001 لجميع السكاشن غداً."
      )
    ) {
      return;
    }

    try {
      setResetLoading(true);
      setFeedback(null);
      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-all-tickets" }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({
          message: json.message || "تم تصفير أرقام التذاكر لتبدأ من 001 بنجاح لجميع سكاشن النظام بالكامل!",
          type: "success",
        });
        await fetchQueues();
      } else {
        setFeedback({
          message: json.error || "فشل إعادة تعيين التذاكر",
          type: "error",
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err.message || "حدث خطأ غير متوقع أثناء تصفير التذاكر",
        type: "error",
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider">
              LIVE RADAR • شاشة التحكم بالأدوار
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            مراقبة وإدارة الطابور الحي
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            متابعة فورية للأدوار، كشف الرقم القومي 14 رقم، توثيق البصمة، التنبيه المكرر، وتأخير غير الحاضرين 10 أدوار للخلف.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          {/* End-of-day Queue Reset Button - Super Admin Only */}
          {isSuperAdmin && (
            <button
              onClick={handleResetAllTickets}
              disabled={resetLoading}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white text-xs font-bold shadow-lg shadow-purple-700/30 border border-purple-500/40 transition flex items-center gap-2 disabled:opacity-50"
              title="إعادة تعيين أرقام التذاكر لتبدأ من رقم 1 لجميع سكاشن النظام في نهاية اليوم"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-purple-200 ${resetLoading ? "animate-spin" : ""}`} />
              <span>{resetLoading ? "جاري تصفير التذاكر..." : "تصفير التذاكر لـ 1 (نهاية اليوم)"}</span>
            </button>
          )}

          <button
            onClick={fetchQueues}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold border border-slate-700 shadow-md transition flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>تحديث الشاشة</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-sm font-medium flex items-center justify-between animate-fade-in ${
            feedback.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs underline text-slate-400 hover:text-white"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-xl">
        {/* Status Pills */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: "ACTIVE", label: "طابور الانتظار النشط", icon: Clock },
            { id: "WAITING", label: "في الانتظار فقط", icon: Clock },
            { id: "CALLED", label: "تم النداء", icon: Volume2 },
            { id: "CANCELLED", label: "أدوار ملغية", icon: XCircle },
            { id: "ALL", label: "الأرشيف بالكامل", icon: Folder },
          ].map((st) => {
            const Icon = st.icon;
            return (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  statusFilter === st.id
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 font-bold border border-blue-400/30"
                    : "bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{st.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرقم الأكاديمي..."
            className="px-4 py-2 rounded-xl border border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-950 text-white placeholder-slate-500"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            <span>بحث</span>
          </button>
        </form>
      </div>

      {/* Main Queue Table */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm space-y-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>جاري تحميل بيانات الأدوار وقائمة الطلاب...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            لا توجد أدوار مسجلة تطابق الفلتر المحدد حالياً.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-[#0b101d] border-b border-slate-800 text-slate-400 text-xs font-bold">
                  <th className="p-4">الدور في الطابور</th>
                  <th className="p-4">اسم الطالب</th>
                  <th className="p-4">الرقم القومي</th>
                  <th className="p-4">الرقم الأكاديمي</th>
                  <th className="p-4">السكشن والمجموعة</th>
                  <th className="p-4">حالة البصمة</th>
                  <th className="p-4">حالة الدور</th>
                  <th className="p-4 text-center">إجراءات التحكم بالدور</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    {/* Dynamic Live Turn & Ticket Number */}
                    <td className="p-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="inline-flex items-center justify-center font-mono font-black text-base px-3 py-1 rounded-xl bg-slate-950 text-amber-400 border border-amber-500/30 shadow-sm" title="الدور الفعلي المتحرك في الطابور">
                          #{item.formattedLiveTurn || item.formattedQueueNumber}
                        </span>
                        {item.formattedLiveTurn && item.formattedLiveTurn !== item.formattedQueueNumber && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            تذكرة: #{item.formattedQueueNumber}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Student Name */}
                    <td className="p-4">
                      <div className="font-extrabold text-white">{item.studentName}</div>
                      {item.hasTelegram ? (
                        <span className="text-[10px] font-semibold text-cyan-400 flex items-center gap-1 mt-0.5">
                          <Send className="w-3 h-3" />
                          <span>مرتبط بالتيليجرام (@batu_face_id_bot)</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">غير مرتبط بتيليجرام</span>
                      )}
                    </td>

                    {/* Decrypted 14-digit National ID */}
                    <td className="p-4 font-mono font-bold text-slate-200">
                      <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs tracking-wider">
                        {item.nationalId}
                      </span>
                    </td>

                    {/* Academic Number */}
                    <td className="p-4 font-mono text-slate-300 text-xs">
                      {item.academicNumber}
                    </td>

                    {/* Section & Group */}
                    <td className="p-4 text-xs">
                      <div className="font-semibold text-slate-200">{item.sectionName}</div>
                      <div className="text-[11px] text-slate-400">{item.groupName}</div>
                    </td>

                    {/* Fingerprint Activation Status */}
                    <td className="p-4">
                      {item.isFingerprintActivated ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>مفعلة</span>
                          </span>
                          <div className="text-[10px] text-slate-400">
                            بواسطة: <b className="text-slate-300">{item.activatedByName}</b>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          <Clock className="w-3 h-3" />
                          <span>لم تفعل بعد</span>
                        </span>
                      )}
                    </td>

                    {/* Booking Status Badge */}
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                          item.status === "WAITING"
                            ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                            : item.status === "CALLED"
                            ? "bg-blue-500/10 text-blue-300 border border-blue-500/30 animate-pulse"
                            : item.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                            : item.status === "CANCELLED"
                            ? "bg-red-500/10 text-red-300 border border-red-500/30"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {item.status === "WAITING" && "في الانتظار"}
                        {item.status === "CALLED" && (
                          <>
                            <Volume2 className="w-3 h-3" />
                            <span>تم النداء</span>
                          </>
                        )}
                        {item.status === "COMPLETED" && (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>مكتمل</span>
                          </>
                        )}
                        {item.status === "CANCELLED" && (
                          <>
                            <XCircle className="w-3 h-3" />
                            <span>ملغي</span>
                          </>
                        )}
                        {item.status === "IN_PROGRESS" && "قيد التسجيل"}
                      </span>
                    </td>

                    {/* Operational Action Buttons */}
                    <td className="p-4">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {/* 1. Repeat Alert Button (Telegram) */}
                        <button
                          onClick={() => handleAction("repeat-alert", item.id)}
                          disabled={actionLoading === `repeat-alert_${item.id}`}
                          title="إرسال نداء فوري مكرر للطالب على التيليجرام"
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition disabled:opacity-50 flex items-center gap-1"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>{actionLoading === `repeat-alert_${item.id}` ? "..." : "نداء عاجل"}</span>
                        </button>

                        {/* 2. Push Back 10 Positions */}
                        <button
                          onClick={() => handleAction("push-back", item.id)}
                          disabled={actionLoading === `push-back_${item.id}`}
                          title="تأخير الطالب 10 أدوار للخلف بسبب عدم الحضور"
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 transition disabled:opacity-50 flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{actionLoading === `push-back_${item.id}` ? "..." : "تأخير 10 أدوار"}</span>
                        </button>

                        {/* 3. Cancel Booking Permanently */}
                        <button
                          onClick={() => {
                            if (confirm(`هل أنت متأكد من إلغاء دور الطالب "${item.studentName}" نهائياً لعدم حضوره؟`)) {
                              handleAction("cancel", item.id);
                            }
                          }}
                          disabled={actionLoading === `cancel_${item.id}`}
                          title="إلغاء الحجز نهائياً وإشعار الطالب على التيليجرام"
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition disabled:opacity-50 flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>{actionLoading === `cancel_${item.id}` ? "..." : "إلغاء الدور"}</span>
                        </button>

                        {/* 4. Instant Fingerprint Activation */}
                        {!item.isFingerprintActivated && item.status !== "CANCELLED" && (
                          <button
                            onClick={() => handleAction("activate", item.id, item.studentId)}
                            disabled={actionLoading === `activate_${item.id}`}
                            title="تفعيل البصمة وتوثيق حضور الطالب الآن"
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition disabled:opacity-50 flex items-center gap-1"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>{actionLoading === `activate_${item.id}` ? "..." : "تفعيل البصمة"}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
