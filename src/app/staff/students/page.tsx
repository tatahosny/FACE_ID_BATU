"use client";

import { useState } from "react";
import { Search, CheckCircle2, AlertTriangle, UserCheck, Clock, ShieldCheck } from "lucide-react";

export default function StaffStudentSearchPage() {
  const [academicNumber, setAcademicNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notes, setNotes] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!academicNumber.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setActionSuccess(null);
      setStudentData(null);

      const res = await fetch(`/api/staff/students?academicNumber=${encodeURIComponent(academicNumber.trim())}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || "لم يتم العثور على طالب بهذا الرقم الأكاديمي");
        return;
      }

      setStudentData(json.data);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء البحث");
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    if (!studentData?.student?.id) return;

    try {
      setActionLoading(true);
      setError(null);

      const res = await fetch("/api/staff/activations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: studentData.student.id,
          bookingId: studentData.latestBooking?.id || undefined,
          status: "ACTIVATED",
          notes: notes.trim() || "تم تسجيل البصمة بنجاح عبر البحث المباشر.",
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || "فشل تسجيل التفعيل");
        return;
      }

      setActionSuccess(json.message || "تم تسجيل تفعيل البصمة بنجاح!");
      setStudentData((prev: any) => ({
        ...prev,
        isActivated: true,
      }));
    } catch (err: any) {
      setError(err.message || "حدث خطأ غير متوقع");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">البحث والتحقق من هوية الطالب</h1>
        <p className="text-xs sm:text-sm text-slate-400">
          البحث الفوري بالرقم الأكاديمي للتحقق وتفعيل البصمة بدون كشف البيانات الحساسة
        </p>
      </div>

      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-xl">
        <label className="block text-xs sm:text-sm font-bold text-slate-200 mb-2">
          أدخل الرقم الأكاديمي للطالب
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            required
            value={academicNumber}
            onChange={(e) => setAcademicNumber(e.target.value)}
            placeholder="مثال: 20230154"
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono text-left"
            dir="ltr"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 py-2.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-blue-600/30 transition"
          >
            <Search className="w-4 h-4" />
            {loading ? "جاري البحث..." : "بحث"}
          </button>
        </div>
      </form>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm font-medium">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {studentData && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 sm:p-8 space-y-6 backdrop-blur-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <span className="text-xs text-slate-400 block">ملف الطالب</span>
              <h2 className="text-xl font-black text-white">{studentData.student.fullName}</h2>
            </div>
            <div>
              {studentData.isActivated ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  بصمة الوجه مفعلة
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Clock className="w-3.5 h-3.5" />
                  بانتظار التفعيل
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm bg-slate-950/70 rounded-xl p-4 border border-slate-800">
            <div>
              <span className="text-slate-400 block">الرقم الأكاديمي:</span>
              <span className="font-mono font-bold text-white">{studentData.student.academicNumber}</span>
            </div>
            <div>
              <span className="text-slate-400 block">ربط التيليجرام:</span>
              <span className={studentData.student.telegramUserId ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {studentData.student.telegramUserId ? "مربوط" : "غير مربوط"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">حالة الحساب:</span>
              <span className="text-slate-200 font-medium">
                {studentData.student.isActive ? "نشط" : "معطل"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">آخر حجز:</span>
              <span className="text-slate-200 font-medium">
                {studentData.latestBooking ? `دور رقم ${studentData.latestBooking.queueNumber}` : "لا يوجد"}
              </span>
            </div>
          </div>

          {/* Action to activate */}
          {!studentData.isActivated && (
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <label className="block text-xs font-bold text-slate-300">
                ملاحظات الموظف التشغيلية (اختياري):
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: تم التأكد من بطاقة الرقم القومي والتقاط البصمة"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleActivate}
                disabled={actionLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-2"
              >
                <UserCheck className="w-4 h-4" />
                {actionLoading ? "جاري تسجيل التفعيل..." : "تأكيد تفعيل بصمة الوجه الآن"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
