"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";

export default function AdminSectionsPage() {
  const [sections, setSections] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [groupId, setGroupId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchSections = async () => {
    try {
      setLoading(true);
      const url = selectedGroup ? `/api/sections?groupId=${selectedGroup}` : "/api/sections";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data.sections) {
        setSections(json.data.sections);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSections();
  }, [selectedGroup]);

  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => j.success && setGroups(j.data.groups));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMessage(null);
      const res = await fetch("/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, groupId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessage(json.error || "فشل إنشاء السكشن");
        return;
      }
      setShowCreate(false);
      setName("");
      setCode("");
      await fetchSections();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">السكاشن الأكاديمية</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            إدارة السكاشن الأكاديمية (12 سكشن - 4 سكاشن لكل مجموعة)
          </p>
        </div>

        <div className="flex gap-2">
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-700 text-xs sm:text-sm bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="" className="bg-slate-900 text-slate-400">جميع المجموعات</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                {g.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowCreate(true)}
            className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold transition shadow-md shadow-blue-600/30"
          >
            + إضافة سكشن
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/30 text-blue-200 text-sm">
          {message}
        </div>
      )}

      {/* Sections Table */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">جاري تحميل السكاشن...</div>
        ) : sections.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">لا توجد سكاشن مسجلة.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#0b101d] text-slate-400 text-xs uppercase border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 font-bold">اسم السكشن</th>
                  <th className="py-3.5 px-4 font-bold">الكود الأكاديمي</th>
                  <th className="py-3.5 px-4 font-bold">تاريخ الإنشاء</th>
                  <th className="py-3.5 px-4 font-bold text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {sections.map((sec) => (
                  <tr key={sec.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-bold text-white">{sec.name}</td>
                    <td className="py-3.5 px-4 font-mono text-cyan-400 font-semibold">{sec.code}</td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {formatCairoDateTime(sec.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {sec.isActive ? "نشط" : "معطل"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-800 text-white">
            <h3 className="font-bold text-lg text-white">إضافة سكشن أكاديمي جديد</h3>
            <form onSubmit={handleCreate} className="space-y-4 text-right">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">المجموعة التابع لها</label>
                <select
                  required
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" className="bg-slate-900 text-slate-400">-- اختر المجموعة --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">اسم السكشن</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: السكشن 13"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">كود السكشن</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="SEC-13"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm font-mono text-left bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition"
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
