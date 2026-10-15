"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/audit-logs?page=${page}&limit=25`);
      const json = await res.json();
      if (json.success && json.data.items) {
        setLogs(json.data.items);
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">سجل التدقيق الأمني (Audit Logs)</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            سجل غير قابل للتعديل لكافة الإجراءات والعمليات الحساسة في النظام
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="py-2 px-3.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-xs font-bold hover:bg-slate-800 transition flex items-center gap-1.5"
        >
          <span>تحديث</span>
        </button>
      </div>

      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">جاري تحميل سجلات التدقيق...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">لا توجد سجلات مسجلة حتى الآن.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-[#0b101d] text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-bold">الحدث / العملية</th>
                  <th className="py-3 px-4 font-bold">القائم بالعملية</th>
                  <th className="py-3 px-4 font-bold">نوع الكيان</th>
                  <th className="py-3 px-4 font-bold">البيانات الإضافية</th>
                  <th className="py-3 px-4 font-bold">التاريخ والتوقيت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {logs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-bold text-cyan-400 font-mono">
                      {item.action}
                    </td>
                    <td className="py-3 px-4 text-white">
                      {item.actorName ? (
                        <span>
                          {item.actorName}{" "}
                          <span className="text-[10px] text-slate-400">({item.actorRole})</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">النظام التلقائي / الطالب</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">{item.entityType}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono max-w-xs truncate">
                      {item.safeMetadata ? JSON.stringify(item.safeMetadata) : "—"}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {formatCairoDateTime(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-xs font-bold disabled:opacity-40 hover:bg-slate-800 transition"
        >
          السابق
        </button>
        <span className="text-xs text-slate-400 font-semibold">
          صفحة {page} من {Math.max(1, Math.ceil(total / 25))}
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={page >= Math.ceil(total / 25)}
          className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-300 text-xs font-bold disabled:opacity-40 hover:bg-slate-800 transition"
        >
          التالي
        </button>
      </div>
    </div>
  );
}
