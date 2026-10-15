"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";

export default function AdminStaffManagementPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("STAFF");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/staff");
      const json = await res.json();
      if (json.success && json.data.staff) {
        setStaff(json.data.staff);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMessage(null);

      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, role }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setMessage({ text: json.error || "فشل إنشاء الحساب", type: "error" });
        return;
      }

      setMessage({ text: "تم إنشاء حساب الموظف بنجاح!", type: "success" });
      setShowModal(false);
      setFullName("");
      setEmail("");
      setPassword("");
      await fetchStaff();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">إدارة حسابات موظفي البصمة</h1>
          <p className="text-xs sm:text-sm text-slate-500">
            إنشاء وإدارة حسابات الموظفين المعتمدين لتسجيل وتوثيق بصمة الوجه للطلاب
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow transition"
        >
          + إضافة موظف جديد
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Staff List */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">جاري تحميل بيانات الموظفين...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#0b101d] text-slate-400 text-xs uppercase border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 font-bold">الاسم الكامل</th>
                  <th className="py-3.5 px-4 font-bold">البريد الإلكتروني</th>
                  <th className="py-3.5 px-4 font-bold">الدور والصلاحية</th>
                  <th className="py-3.5 px-4 font-bold">تاريخ الإنشاء</th>
                  <th className="py-3.5 px-4 font-bold text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {staff.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-bold text-white">{u.fullName}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-300">{u.email}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          u.role === "SUPER_ADMIN"
                            ? "bg-purple-500/10 text-purple-300 border border-purple-500/30"
                            : "bg-blue-500/10 text-cyan-300 border border-blue-500/30"
                        }`}
                      >
                        {u.role === "SUPER_ADMIN" ? "مدير النظام العام" : "موظف بصمة"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {formatCairoDateTime(u.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {u.isActive ? "نشط" : "معطل"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-800 text-white">
            <h3 className="font-bold text-lg text-white">إضافة حساب موظف بصمة جديد</h3>
            <form onSubmit={handleCreate} className="space-y-4 text-right">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="محمد أحمد إبراهيم"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">البريد الإلكتروني الجامعي</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@batu.edu.eg"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm font-mono text-left bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">كلمة المرور (8 خانات على الأقل)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm text-left bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">الدور والصلاحية</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="STAFF" className="bg-slate-900 text-white">موظف بصمة (Staff)</option>
                  <option value="SUPER_ADMIN" className="bg-slate-900 text-white">مدير نظام عام (Super Admin)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition"
                >
                  {submitting ? "جاري الإنشاء..." : "إنشاء الحساب"}
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
