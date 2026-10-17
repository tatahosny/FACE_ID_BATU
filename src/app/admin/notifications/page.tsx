"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import { RefreshCw, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/notifications?page=${page}&limit=25`);
      const json = await res.json();
      if (json.success && json.data.items) {
        setItems(json.data.items);
        setTotal(json.data.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">سجلات تسليم إشعارات التيليجرام</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            متابعة حالة إرسال الإشعارات الصادرة (Outbox) وتأكيد التسليم أو أسباب الفشل
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 py-2 px-4 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold transition shadow-sm self-stretch sm:self-auto justify-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
          <span>تحديث السجلات</span>
        </button>
      </div>

      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">جاري تحميل سجلات الإشعارات...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">لا توجد إشعارات مسجلة حتى الآن.</div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right text-xs min-w-[700px]">
              <thead className="bg-[#0b101d] text-slate-400 uppercase border-b border-slate-800 font-bold">
                <tr>
                  <th className="py-3.5 px-4">نوع الحدث</th>
                  <th className="py-3.5 px-4">الطالب المستلم</th>
                  <th className="py-3.5 px-4">معرف التيليجرام</th>
                  <th className="py-3.5 px-4">المحاولات</th>
                  <th className="py-3.5 px-4">تاريخ الإنشاء</th>
                  <th className="py-3.5 px-4">تاريخ الإرسال</th>
                  <th className="py-3.5 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-bold text-white font-mono">
                      {item.eventType}
                    </td>
                    <td className="py-3 px-4 text-slate-200 font-medium">
                      {item.studentName ? `${item.studentName} (${item.academicNumber})` : "—"}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">{item.telegramChatId}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">{item.attempts}</td>
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
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
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
                            قيد الإرسال
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3 text-rose-400" />
                            فشل
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
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
          صفحة {page} من {Math.max(1, Math.ceil(total / 25))}
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= Math.ceil(total / 25)}
          className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-bold disabled:opacity-40 hover:bg-slate-700 transition"
        >
          التالي
        </button>
      </div>
    </div>
  );
}
