"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import {
  Clock,
  Play,
  Pause,
  XCircle,
  Plus,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  X,
  Calendar,
  Layers,
} from "lucide-react";

export default function AdminBookingWindowsPage() {
  const [windows, setWindows] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Form State
  const [formGroupId, setFormGroupId] = useState("");
  const [formSectionId, setFormSectionId] = useState("");
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formCapacity, setFormCapacity] = useState(50);
  const [formStatus, setFormStatus] = useState("OPEN");
  const [submitting, setSubmitting] = useState(false);

  const fetchWindows = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/booking-windows");
      const json = await res.json();
      if (json.success && json.data.windows) {
        setWindows(json.data.windows);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWindows();

    // Fetch groups
    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => j.success && setGroups(j.data.groups));
  }, []);

  // Fetch sections when group changes in create form
  useEffect(() => {
    if (!formGroupId) {
      setSections([]);
      setFormSectionId("");
      return;
    }
    fetch(`/api/sections?groupId=${formGroupId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data.sections) {
          setSections(j.data.sections);
          if (j.data.sections.length > 0) {
            setFormSectionId(j.data.sections[0].id);
          }
        }
      });
  }, [formGroupId]);

  const handleStatusChange = async (windowId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/booking-windows/${windowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({
          text:
            newStatus === "OPEN"
              ? "تم فتح فترة الحجز بنجاح وبث رسالة تيليجرام لجميع طلاب السكشن المسجلين!"
              : newStatus === "PAUSED" || newStatus === "CLOSED"
              ? "تم إيقاف فترة الحجز وبث تنبيه فوري عبر التيليجرام لجميع طلاب السكشن لحين إشعار آخر!"
              : `تم تحديث حالة الفترة إلى ${newStatus}`,
          type: "success",
        });
        fetchWindows();
      } else {
        setMessage({ text: json.error || "فشل التحديث", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMessage(null);

      const startsAt = formStartsAt ? new Date(formStartsAt).toISOString() : new Date().toISOString();
      const endsAt = formEndsAt
        ? new Date(formEndsAt).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const res = await fetch("/api/booking-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: formGroupId,
          sectionId: formSectionId,
          startsAt,
          endsAt,
          capacity: formCapacity,
          status: formStatus,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setMessage({ text: "تم إنشاء فترة الحجز بنجاح!", type: "success" });
        setShowCreateModal(false);
        fetchWindows();
      } else {
        setMessage({ text: json.error || "فشل إنشاء الفترة", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">
              BOOKING SLOTS • ضوابط ونوافذ الحجز
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            إدارة فترات وضوابط الحجز لكل سكشن
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            التحكم في مواعيد فتح وإيقاف الحجز لكل سكشن، وتفعيل البث التلقائي عبر تيليجرام عند الفتح أو الإيقاف
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء فترة حجز جديدة لسكشن</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl border text-sm font-medium flex items-center justify-between ${
            message.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs underline text-slate-400 hover:text-white">
            إغلاق
          </button>
        </div>
      )}

      {/* Windows Table */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm space-y-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>جاري تحميل فترات الحجز...</p>
          </div>
        ) : windows.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            لا توجد فترات حجز مسجلة. اضغط على «إنشاء فترة حجز جديدة» للبدء.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#0b101d] text-slate-400 text-xs font-bold border-b border-slate-800">
                <tr>
                  <th className="py-4 px-4">المجموعة / السكشن</th>
                  <th className="py-4 px-4">بداية الفترة</th>
                  <th className="py-4 px-4">نهاية الفترة</th>
                  <th className="py-4 px-4">إجمالي المحجوز</th>
                  <th className="py-4 px-4">الحالة</th>
                  <th className="py-4 px-4 text-center">التحكم الفوري والبث</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {windows.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-4 px-4">
                      <div className="font-bold text-white text-base">{w.sectionName}</div>
                      <div className="text-xs text-slate-400">{w.groupName}</div>
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-slate-300">
                      {formatCairoDateTime(w.startsAt)}
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-slate-300">
                      {formatCairoDateTime(w.endsAt)}
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-bold text-white font-mono text-sm">
                        {w.bookedCount} طالب
                      </div>
                      <div className="text-[11px] text-emerald-400">
                        متاح لجميع طلاب السكشن
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                          w.status === "OPEN"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : w.status === "PAUSED"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                            : w.status === "CLOSED"
                            ? "bg-red-500/10 text-red-400 border border-red-500/30"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {w.status === "OPEN" && (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span>مفتوح للحجز</span>
                          </>
                        )}
                        {w.status === "PAUSED" && (
                          <>
                            <Pause className="w-3 h-3 text-amber-400" />
                            <span>موقوف مؤقتاً</span>
                          </>
                        )}
                        {w.status === "CLOSED" && (
                          <>
                            <XCircle className="w-3 h-3 text-red-400" />
                            <span>مغلق</span>
                          </>
                        )}
                        {w.status === "DRAFT" && <span>مسودة</span>}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {w.status !== "OPEN" && (
                          <button
                            onClick={() => handleStatusChange(w.id, "OPEN")}
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition flex items-center gap-1 shadow-md shadow-emerald-600/30"
                            title="فتح الحجز وإرسال إشعار فوري لجميع طلاب السكشن على التيليجرام"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>فتح وإشعار السكشن</span>
                          </button>
                        )}
                        {w.status === "OPEN" && (
                          <button
                            onClick={() => handleStatusChange(w.id, "PAUSED")}
                            className="px-3 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition flex items-center gap-1"
                            title="إيقاف الحجز مؤقتاً وبث تنبيه للطلاب"
                          >
                            <Pause className="w-3.5 h-3.5" />
                            <span>إيقاف وبث التنبيه</span>
                          </button>
                        )}
                        {w.status !== "CLOSED" && (
                          <button
                            onClick={() => handleStatusChange(w.id, "CLOSED")}
                            className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold transition flex items-center gap-1"
                            title="إغلاق الحجز نهائياً وبث تنبيه للطلاب"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>إغلاق الفترة</span>
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

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0b101d] rounded-2xl border border-slate-800 max-w-lg w-full p-6 space-y-5 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <span>إنشاء فترة حجز جديدة لسكشن</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">المجموعة الدراسية:</label>
                <select
                  required
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">اختر المجموعة...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">السكشن:</label>
                <select
                  required
                  value={formSectionId}
                  onChange={(e) => setFormSectionId(e.target.value)}
                  disabled={!formGroupId || sections.length === 0}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">اختر السكشن...</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">تاريخ ووقت البداية:</label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">تاريخ ووقت النهاية:</label>
                  <input
                    type="datetime-local"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">الحالة المبدئية للفترة:</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="OPEN">مفتوح للحجز فوراً (مع إشعار الطلاب تلقائياً)</option>
                  <option value="DRAFT">مسودة (غير متاح للطلاب بعد)</option>
                  <option value="PAUSED">موقوف مؤقتاً</option>
                </select>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold transition shadow-md disabled:opacity-50"
                >
                  {submitting ? "جاري الإنشاء..." : "حفظ وإنشاء الفترة"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
