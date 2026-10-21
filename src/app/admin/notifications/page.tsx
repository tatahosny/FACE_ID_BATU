"use client";

import { useState, useEffect, useRef } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import {
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Zap,
  RotateCcw,
  Search,
  Filter,
  Send,
  BellRing,
  Info,
  Check,
  X,
  Radio,
} from "lucide-react";

interface NotificationItem {
  id: string;
  eventType: string;
  telegramChatId: number;
  status: "DELIVERED" | "PENDING" | "PROCESSING" | "FAILED";
  attempts: number;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
  payload: any;
  studentName: string | null;
  academicNumber: string | null;
}

interface OutboxStats {
  total: number;
  delivered: number;
  pending: number;
  processing: number;
  failed: number;
  isWorkerRunning: boolean;
}

const EVENT_TYPE_LABELS: Record<string, { label: string; badge: string }> = {
  PROXIMITY_NEXT: {
    label: "الدور التالي مباشرة (Next)",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  PROXIMITY_5: {
    label: "متبقي 5 أدوار فقط",
    badge: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
  PROXIMITY_10: {
    label: "متبقي 10 أدوار",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  PROXIMITY_15: {
    label: "متبقي 15 دوراً",
    badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  },
  TURN_CALLED: {
    label: "مناداة الدور (حان دورك)",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  REPEAT_ALERT: {
    label: "تكرار نداء الدور",
    badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  QUEUE_PUSH_BACK: {
    label: "تأخير الدور 10 مراكز",
    badge: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  BOOKING_CONFIRMATION: {
    label: "تأكيد حجز التذكرة",
    badge: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  },
  BOOKING_CANCELLED: {
    label: "إلغاء حجز الدور",
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
  WINDOW_OPENED: {
    label: "فتح فترة حجز السكشن",
    badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  },
  WINDOW_PAUSED: {
    label: "إيقاف حجز السكشن",
    badge: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  },
  ACTIVATION_SUCCESS: {
    label: "تفعيل بصمة الوجه",
    badge: "bg-green-500/10 text-green-400 border-green-500/20",
  },
  CAMPAIGN_MESSAGE: {
    label: "إعلان / حملة جماعية",
    badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  },
};

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [eventFilter, setEventFilter] = useState("ALL");
  const [stats, setStats] = useState<OutboxStats>({
    total: 0,
    delivered: 0,
    pending: 0,
    processing: 0,
    failed: 0,
    isWorkerRunning: false,
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [activeItemModal, setActiveItemModal] = useState<NotificationItem | null>(null);

  const fetchLogs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "25");
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (eventFilter !== "ALL") params.set("eventType", eventFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/notifications?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setItems(json.data.items || []);
        setTotal(json.data.total || 0);
        if (json.data.stats) {
          setStats(json.data.stats);
        }
      }
    } catch (err) {
      console.error("Failed to fetch notification logs:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, statusFilter, eventFilter]);

  // Auto-refresh poll when there are pending/processing items
  useEffect(() => {
    if (stats.pending > 0 || stats.processing > 0) {
      const interval = setInterval(() => {
        fetchLogs(true);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [stats.pending, stats.processing, page, statusFilter, eventFilter, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const handleTriggerWorker = async (action: "trigger" | "retry-failed") => {
    try {
      setActionLoading(action);
      setFeedback(null);
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ message: json.message || "تم تشغيل المعالج التلقائي بنجاح", type: "success" });
        if (json.data?.stats) setStats(json.data.stats);
        fetchLogs(true);
      } else {
        setFeedback({ message: json.error || "فشل تشغيل المعالج", type: "error" });
      }
    } catch (err: any) {
      setFeedback({ message: err?.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const deliveredPercentage =
    stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 100;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">
              TELEGRAM OUTBOX DISPATCHER • المعالج الذاتي لإشعارات الطابور
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            طابور إشعارات الأدوار والاقتراب
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            معالجة غير متزامنة وآمنة لإشعارات الطابور (15 دور، 10 أدوار، 5 أدوار، التالي، حان دورك) مع حماية ضد حظر التيليجرام
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {stats.failed > 0 && (
            <button
              onClick={() => handleTriggerWorker("retry-failed")}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold transition shadow-sm"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${actionLoading === "retry-failed" ? "animate-spin" : ""}`} />
              <span>إعادة محاولة الفاشلة ({stats.failed})</span>
            </button>
          )}

          <button
            onClick={() => handleTriggerWorker("trigger")}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold transition shadow-md shadow-blue-500/20"
          >
            <Zap className={`w-3.5 h-3.5 ${actionLoading === "trigger" ? "animate-spin" : ""}`} />
            <span>تشغيل المعالجة الآن</span>
          </button>

          <button
            onClick={() => fetchLogs()}
            className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : "text-slate-400"}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            feedback.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Real-time Status Card Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
            <span>إجمالي الإشعارات الصادرة</span>
            <BellRing className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{stats.total}</div>
          <div className="text-[11px] text-slate-500 mt-1">تراكمي منذ بدء التشغيل</div>
        </div>

        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-bold mb-1">
            <span>تم التسليم بنجاح</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {stats.delivered}
            <span className="text-xs font-normal text-emerald-500/80 mr-2">
              ({deliveredPercentage}%)
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">وصلت لحسابات الطلاب فوراً</div>
        </div>

        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-amber-400 text-xs font-bold mb-1">
            <span>في طابور الإرسال (قيد المعالجة)</span>
            <Clock className={`w-4 h-4 text-amber-400 ${stats.pending > 0 ? "animate-spin" : ""}`} />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {stats.pending + stats.processing}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {stats.pending > 0 ? "يتم الإرسال تباعاً بفاصل 60ms" : "لا يوجد تراكم حالياً"}
          </div>
        </div>

        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-lg backdrop-blur-xl">
          <div className="flex items-center justify-between text-rose-400 text-xs font-bold mb-1">
            <span>تعذر التسليم (مستنفذ المحاولات)</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono">{stats.failed}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {stats.failed > 0 ? "حساب محظور أو غير مرتبط" : "صفر أخطاء"}
          </div>
        </div>
      </div>

      {/* Progress bar if pending */}
      {stats.pending > 0 && (
        <div className="bg-blue-950/40 border border-blue-500/30 rounded-2xl p-4 space-y-2 backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-blue-200 font-bold">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              المعالج التلقائي يعمل في الخلفية بنظام التدفق الآمن (Throttled Delivery)...
            </span>
            <span className="font-mono text-cyan-300">
              متبقي {stats.pending} إشعار
            </span>
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-300 rounded-full"
              style={{
                width: `${Math.max(
                  5,
                  Math.min(
                    100,
                    Math.round(
                      (stats.delivered / Math.max(1, stats.delivered + stats.pending)) * 100
                    )
                  )
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Filters and Search Bar */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl backdrop-blur-xl">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="البحث باسم الطالب أو الرقم الأكاديمي..."
              className="w-full pr-9 pl-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition"
            >
              <option value="ALL">جميع أنواع الأحداث</option>
              <option value="PROXIMITY_NEXT">الدور التالي مباشرة (Next)</option>
              <option value="PROXIMITY_5">اقتراب 5 أدوار</option>
              <option value="PROXIMITY_10">اقتراب 10 أدوار</option>
              <option value="PROXIMITY_15">اقتراب 15 دوراً</option>
              <option value="TURN_CALLED">مناداة الدور (حان دورك)</option>
              <option value="REPEAT_ALERT">تكرار النداء</option>
              <option value="QUEUE_PUSH_BACK">تأخير الدور</option>
              <option value="BOOKING_CONFIRMATION">تأكيد حجز التذكرة</option>
              <option value="BOOKING_CANCELLED">إلغاء حجز الدور</option>
              <option value="WINDOW_OPENED">فتح فترة الحجز</option>
              <option value="WINDOW_PAUSED">إيقاف فترة الحجز</option>
              <option value="ACTIVATION_SUCCESS">تفعيل البصمة</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 transition"
            >
              <option value="ALL">جميع الحالات</option>
              <option value="DELIVERED">تم التسليم ✅</option>
              <option value="PENDING">في الانتظار ⏳</option>
              <option value="FAILED">تعذر التسليم ❌</option>
            </select>
          </div>

          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-white transition flex items-center justify-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              <span>تطبيق</span>
            </button>
            {(search || statusFilter !== "ALL" || eventFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("ALL");
                  setEventFilter("ALL");
                  setPage(1);
                }}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-300 transition"
                title="إلغاء الفلاتر"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Table Section */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span>جاري تحميل سجلات الإشعارات الصادرة...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center gap-2">
            <Info className="w-8 h-8 text-slate-600 mb-1" />
            <span className="font-bold text-slate-300">لا توجد إشعارات مطابقة لمعايير البحث.</span>
            <span className="text-xs text-slate-500">
              تأكد من اختيار فلاتر أخرى أو تشغيل الحجوزات لتوليد إشعارات جديدة.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right text-xs min-w-[760px]">
              <thead className="bg-[#0b101d] text-slate-400 uppercase border-b border-slate-800 font-bold">
                <tr>
                  <th className="py-3.5 px-4">نوع الحدث</th>
                  <th className="py-3.5 px-4">الطالب المستلم</th>
                  <th className="py-3.5 px-4">معرف التيليجرام</th>
                  <th className="py-3.5 px-4">المحاولات</th>
                  <th className="py-3.5 px-4">تاريخ الإنشاء</th>
                  <th className="py-3.5 px-4">تاريخ الإرسال</th>
                  <th className="py-3.5 px-4 text-center">الحالة</th>
                  <th className="py-3.5 px-4 text-center">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {items.map((item) => {
                  const eventMeta = EVENT_TYPE_LABELS[item.eventType] || {
                    label: item.eventType,
                    badge: "bg-slate-500/10 text-slate-300 border-slate-500/20",
                  };

                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-bold">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${eventMeta.badge}`}
                        >
                          {eventMeta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {item.studentName ? (
                          <div>
                            <div className="font-bold text-white">{item.studentName}</div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {item.academicNumber}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {item.telegramChatId}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            item.attempts > 1 ? "bg-amber-500/20 text-amber-300" : "text-slate-400"
                          }`}
                        >
                          {item.attempts}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {formatCairoDateTime(item.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {item.sentAt ? formatCairoDateTime(item.sentAt) : "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            item.status === "DELIVERED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : item.status === "PENDING"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                              : item.status === "PROCESSING"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {item.status === "DELIVERED" ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              تم التسليم
                            </>
                          ) : item.status === "PENDING" ? (
                            <>
                              <Clock className="w-3 h-3 text-amber-400" />
                              في الانتظار
                            </>
                          ) : item.status === "PROCESSING" ? (
                            <>
                              <Zap className="w-3 h-3 text-blue-400" />
                              جاري المعالجة
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3 h-3 text-rose-400" />
                              فشل
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setActiveItemModal(item)}
                          className="py-1 px-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300 transition"
                        >
                          معاينة
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40 hover:bg-slate-700 transition"
        >
          السابق
        </button>
        <span className="text-xs text-slate-400 font-semibold">
          صفحة {page} من {Math.max(1, Math.ceil(total / 25))} (إجمالي: {total} سجل)
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= Math.ceil(total / 25)}
          className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40 hover:bg-slate-700 transition"
        >
          التالي
        </button>
      </div>

      {/* Item Detail / Preview Modal */}
      {activeItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-black text-white">تفاصيل الإشعار الصادر</h3>
              </div>
              <button
                onClick={() => setActiveItemModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block mb-0.5">نوع الحدث:</span>
                  <span className="font-bold text-white font-mono">{activeItemModal.eventType}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">حالة التسليم:</span>
                  <span className="font-bold text-emerald-400 font-mono">{activeItemModal.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">الطالب:</span>
                  <span className="font-bold text-white">
                    {activeItemModal.studentName || "—"} ({activeItemModal.academicNumber || "—"})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">معرف التيليجرام:</span>
                  <span className="font-bold text-cyan-400 font-mono">
                    {activeItemModal.telegramChatId}
                  </span>
                </div>
              </div>

              {activeItemModal.lastError && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-rose-300">
                  <span className="font-bold block mb-1">سبب تعذر التسليم الأخير:</span>
                  <code className="text-[11px] font-mono break-all">{activeItemModal.lastError}</code>
                </div>
              )}

              <div>
                <span className="text-slate-400 block mb-1 font-bold">نص الرسالة / البيانات (Payload):</span>
                <div className="bg-[#0b101d] border border-slate-800 p-3 rounded-xl max-h-48 overflow-y-auto text-slate-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                  {activeItemModal.payload?.message ||
                    JSON.stringify(activeItemModal.payload, null, 2)}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setActiveItemModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
