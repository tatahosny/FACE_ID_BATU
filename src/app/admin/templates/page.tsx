"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/telegram/templates");
      const json = await res.json();
      if (json.success && json.data.templates) {
        setTemplates(json.data.templates);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMsg(null);
      const res = await fetch("/api/telegram/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setMsg(json.error || "فشل إنشاء القالب");
        return;
      }
      setShowModal(false);
      setName("");
      setContent("");
      await fetchTemplates();
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">قوالب رسائل التيليجرام</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            إدارة القوالب الجاهزة للإعلانات الرسمية والتنبيهات الدورية
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow transition"
        >
          + إضافة قالب جديد
        </button>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-2 p-12 text-center text-slate-500 text-sm">جاري تحميل القوالب...</div>
        ) : templates.length === 0 ? (
          <div className="col-span-2 p-12 text-center text-slate-500 text-sm">لا توجد قوالب محفوظة.</div>
        ) : (
          templates.map((tpl) => (
            <div key={tpl.id} className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-3 backdrop-blur-xl">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-base text-white">{tpl.name}</h3>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  نشط
                </span>
              </div>
              <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 whitespace-pre-wrap leading-relaxed">
                {tpl.content}
              </p>
              <p className="text-[10px] text-slate-400">
                تاريخ الإنشاء: {formatCairoDateTime(tpl.createdAt)}
              </p>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-800 text-white text-right">
            <h3 className="font-bold text-lg text-white">إضافة قالب رسالة جديد</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم القالب</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: تنبيه بشأن إحضار الهوية الرسمية"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">نص الرسالة</label>
                <textarea
                  required
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="نص القالب..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition"
                >
                  {submitting ? "جاري الحفظ..." : "حفظ القالب"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition"
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
