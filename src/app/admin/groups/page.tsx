"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/groups");
      const json = await res.json();
      if (json.success && json.data.groups) {
        setGroups(json.data.groups);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMessage(null);
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessage(json.error || "فشل إنشاء المجموعة");
        return;
      }
      setShowCreate(false);
      setName("");
      setCode("");
      await fetchGroups();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">المجموعات الأكاديمية</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            إدارة المجموعات الأكاديمية لطلاب الفرقة الثانية (مخزنة في قاعدة البيانات)
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold transition shadow"
        >
          + إضافة مجموعة جديدة
        </button>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          {message}
        </div>
      )}

      {/* Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-3 p-12 text-center text-slate-400 text-sm">جاري تحميل المجموعات...</div>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-3 backdrop-blur-xl">
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-500/10 text-cyan-400 border border-blue-500/30">
                  {g.code}
                </span>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                  {g.isActive ? "نشطة" : "معطلة"}
                </span>
              </div>
              <h3 className="font-bold text-lg text-white">{g.name}</h3>
              <p className="text-xs text-slate-400">
                تاريخ الإنشاء: {formatCairoDateTime(g.createdAt)}
              </p>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-800 text-white">
            <h3 className="font-bold text-lg text-white">إضافة مجموعة أكاديمية جديدة</h3>
            <form onSubmit={handleCreate} className="space-y-4 text-right">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم المجموعة</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: المجموعة الرابعة"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">كود المجموعة</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="G4"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm font-mono text-left bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition"
                >
                  {submitting ? "جاري الحفظ..." : "حفظ"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
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
