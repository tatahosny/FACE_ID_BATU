"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import { CheckCircle2, ShieldCheck, Clock } from "lucide-react";

export default function StaffActivationsPage() {
  const [activations, setActivations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/staff/activations");
        const json = await res.json();
        if (json.success && json.data.items) {
          setActivations(json.data.items);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">سجل تفعيلات بصمة الوجه</h1>
        <p className="text-xs sm:text-sm text-slate-400">
          سجل توثيقي لجميع الطلاب الذين تم تفعيل بصماتهم بنجاح واسم الموظف المسؤول
        </p>
      </div>

      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">جاري تحميل السجلات...</div>
        ) : activations.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            لا توجد سجلات تفعيل حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#0b101d] text-slate-400 text-xs uppercase border-b border-slate-800 font-bold">
                <tr>
                  <th className="py-3.5 px-4">اسم الطالب</th>
                  <th className="py-3.5 px-4">الرقم الأكاديمي</th>
                  <th className="py-3.5 px-4">تمت المعالجة بواسطة</th>
                  <th className="py-3.5 px-4">تاريخ ووقت التفعيل</th>
                  <th className="py-3.5 px-4">ملاحظات</th>
                  <th className="py-3.5 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {activations.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-4 px-4 font-bold text-white">{item.studentName}</td>
                    <td className="py-4 px-4 font-mono text-slate-400">{item.academicNumber}</td>
                    <td className="py-4 px-4 text-slate-200 font-medium">{item.staffName}</td>
                    <td className="py-4 px-4 text-slate-400 text-xs">
                      {formatCairoDateTime(item.activatedAt)}
                    </td>
                    <td className="py-4 px-4 text-slate-400 text-xs">{item.notes || "—"}</td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        مفعل
                      </span>
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
