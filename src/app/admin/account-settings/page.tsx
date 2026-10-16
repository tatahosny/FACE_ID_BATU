"use client";

import { useState, useEffect } from "react";
import {
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  User,
  Sparkles,
} from "lucide-react";

export default function AdminAccountSettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        setLoading(true);
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.success && json.data?.user) {
          setUser(json.data.user);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: "", color: "bg-slate-700" };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass) || /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score: 33, text: "ضعيفة", color: "bg-rose-500" };
    if (score <= 4) return { score: 66, text: "جيدة ومقبولة", color: "bg-amber-500" };
    return { score: 100, text: "قوية جداً وممتازة", color: "bg-emerald-500" };
  };

  const strength = getPasswordStrength(newPassword);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (newPassword.length < 6) {
      setFeedback({ message: "كلمة المرور الجديدة يجب ألا تقل عن 6 خانات", type: "error" });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ message: "كلمة المرور الجديدة وتأكيدها غير متطابقين", type: "error" });
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل تغيير كلمة المرور", type: "error" });
        return;
      }

      setFeedback({ message: json.message || "تم تغيير كلمة المرور بنجاح!", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center space-y-3">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-400">جاري تحميل إعدادات الحساب...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
          <KeyRound className="w-7 h-7 text-blue-500" />
          <span>إعدادات الحساب وكلمة المرور</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          إدارة أمان حسابك الشخصي في منظومة بصمة الوجه وتحديث كلمة المرور الخاصة بك.
        </p>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl text-sm font-medium flex items-center justify-between border ${
            feedback.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs underline text-slate-400 hover:text-white"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Account Info Details */}
      <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 shadow-xl backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <User className="w-4 h-4 text-blue-400" />
            <span>بيانات الحساب الحالي</span>
          </h2>
          <span className="text-xs text-purple-300 font-bold px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30">
            {user?.role === "SUPER_ADMIN" ? "مدير النظام العام (Super Admin)" : "موظف بصمة معتمد (Staff)"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-slate-400 font-medium block">الاسم الكامل:</span>
            <span className="font-bold text-white text-sm">{user?.fullName || "—"}</span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
            <span className="text-slate-400 font-medium block">البريد الإلكتروني:</span>
            <span className="font-mono font-bold text-cyan-300 text-sm">{user?.email || "—"}</span>
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="bg-gradient-to-br from-[#0c1322] via-slate-900 to-[#0b101c] rounded-3xl border border-blue-500/30 p-6 sm:p-7 shadow-2xl backdrop-blur-xl space-y-5">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <KeyRound className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-base font-bold text-white">تعديل كلمة المرور</h2>
            <p className="text-[11px] text-slate-400">
              قم بإدخال كلمة المرور الحالية ثم كلمة المرور الجديدة وتأكيدها
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-300 mb-1.5">كلمة المرور الحالية:</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 pl-10"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute left-3 top-3 text-slate-400 hover:text-white"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-300 mb-1.5">
                كلمة المرور الجديدة (6 خانات على الأقل):
              </label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 pl-10"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute left-3 top-3 text-slate-400 hover:text-white"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${strength.color}`}
                      style={{ width: `${strength.score}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>قوة كلمة المرور:</span>
                    <span className="font-bold text-slate-200">{strength.text}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1.5">
                تأكيد كلمة المرور الجديدة:
              </label>
              <input
                type={showNew ? "text" : "password"}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                dir="ltr"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Lock className={`w-4 h-4 ${submitting ? "animate-spin" : ""}`} />
              <span>{submitting ? "جاري الحفظ والتشفير..." : "حفظ كلمة المرور الجديدة"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
