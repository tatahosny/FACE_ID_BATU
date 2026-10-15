"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import { Megaphone, Play, CheckCircle2, UserX, Clock, AlertTriangle, ShieldCheck } from "lucide-react";

interface QueueItem {
  id: string;
  queueNumber: number;
  formattedQueueNumber: string;
  status: string;
  bookedAt: string;
  calledAt: string | null;
  studentName: string;
  academicNumber: string;
  sectionName: string;
}

export default function StaffQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("WAITING");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const url = filterStatus ? `/api/bookings?status=${filterStatus}` : "/api/bookings";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data.items) {
        setItems(json.data.items);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 10000); // 10s live poll
    return () => clearInterval(interval);
  }, [filterStatus]);

  const handleTransition = async (bookingId: string, newStatus: string, notes?: string) => {
    try {
      setActionLoadingId(bookingId);
      setMessage(null);

      const res = await fetch(`/api/bookings/${bookingId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, notes }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessage({ text: json.error || "فشل تحديث الحالة", type: "error" });
        return;
      }

      setMessage({ text: `تم تحديث الحالة بنجاح إلى: ${newStatus}`, type: "success" });
      await fetchQueue();
    } catch (err: any) {
      setMessage({ text: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Complete and activate fingerprint
  const handleActivateFingerprint = async (item: QueueItem) => {
    try {
      setActionLoadingId(item.id);
      setMessage(null);

      // Search student ID first
      const studentRes = await fetch(`/api/staff/students?academicNumber=${item.academicNumber}`);
      const studentJson = await studentRes.json();
      if (!studentJson.success) {
        setMessage({ text: "فشل التحقق من حساب الطالب", type: "error" });
        return;
      }

      const studentId = studentJson.data.student.id;

      // Call record activation
      const actRes = await fetch("/api/staff/activations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          bookingId: item.id,
          status: "ACTIVATED",
          notes: "تم التقاط بصمة الوجه بنجاح وتفعيل الحساب.",
        }),
      });

      const actJson = await actRes.json();
      if (!actRes.ok || !actJson.success) {
        setMessage({ text: actJson.error || "فشل تسجيل التفعيل", type: "error" });
        return;
      }

      setMessage({
        text: `تم تفعيل بصمة الوجه للطالب: ${item.studentName} بنجاح وإرسال إشعار التيليجرام!`,
        type: "success",
      });

      await fetchQueue();
    } catch (err: any) {
      setMessage({ text: err.message || "فشل إتمام العملية", type: "error" });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Title & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">إدارة الطابور والنداء المباشر</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            التحكم في مناداة الطلاب الحاضرين وتأكيد تسجيل بصمات الوجه
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          {["WAITING", "CALLED", "IN_PROGRESS", "COMPLETED", ""].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition border ${
                filterStatus === st
                  ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/30"
                  : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              {st === "WAITING"
                ? "في الانتظار"
                : st === "CALLED"
                ? "تم النداء"
                : st === "IN_PROGRESS"
                ? "قيد التسجيل"
                : st === "COMPLETED"
                ? "مكتمل"
                : "الكل"}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2.5 p-4 rounded-xl text-sm font-medium border ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/20 text-rose-300"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Queue Table */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading && items.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            جاري تحميل قائمة الطلاب في الطابور...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            لا توجد حجوزات تطابق هذا التصنيف حالياً.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#0b101d] text-slate-400 text-xs uppercase border-b border-slate-800 font-bold">
                <tr>
                  <th className="py-3.5 px-4">رقم الدور</th>
                  <th className="py-3.5 px-4">اسم الطالب</th>
                  <th className="py-3.5 px-4">الرقم الأكاديمي</th>
                  <th className="py-3.5 px-4">السكشن</th>
                  <th className="py-3.5 px-4">الحالة</th>
                  <th className="py-3.5 px-4 text-center">إجراءات الموظف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-4 px-4 font-black font-mono text-base text-blue-400">
                      {item.formattedQueueNumber}
                    </td>
                    <td className="py-4 px-4 font-bold text-white">{item.studentName}</td>
                    <td className="py-4 px-4 font-mono text-slate-400">{item.academicNumber}</td>
                    <td className="py-4 px-4 text-slate-300 font-medium">{item.sectionName}</td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                          item.status === "WAITING"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : item.status === "CALLED"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"
                            : item.status === "IN_PROGRESS"
                            ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            : item.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {item.status === "WAITING"
                          ? "في الانتظار"
                          : item.status === "CALLED"
                          ? "تم النداء"
                          : item.status === "IN_PROGRESS"
                          ? "قيد التسجيل"
                          : item.status === "COMPLETED"
                          ? "تم التفعيل"
                          : item.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {item.status === "WAITING" && (
                          <button
                            onClick={() => handleTransition(item.id, "CALLED")}
                            disabled={actionLoadingId === item.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition disabled:opacity-50"
                          >
                            <Megaphone className="w-3.5 h-3.5" />
                            نداء دور الطالب
                          </button>
                        )}

                        {item.status === "CALLED" && (
                          <button
                            onClick={() => handleTransition(item.id, "IN_PROGRESS")}
                            disabled={actionLoadingId === item.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-600/30 transition disabled:opacity-50"
                          >
                            <Play className="w-3.5 h-3.5" />
                            بدء التسجيل
                          </button>
                        )}

                        {(item.status === "IN_PROGRESS" || item.status === "CALLED") && (
                          <button
                            onClick={() => handleActivateFingerprint(item)}
                            disabled={actionLoadingId === item.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            تأكيد تفعيل البصمة
                          </button>
                        )}

                        {item.status !== "COMPLETED" && item.status !== "CANCELLED" && (
                          <button
                            onClick={() => handleTransition(item.id, "NO_SHOW", "الطالب لم يحضر بعد النداء")}
                            disabled={actionLoadingId === item.id}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800 text-xs font-medium transition disabled:opacity-50"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            لم يحضر
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
