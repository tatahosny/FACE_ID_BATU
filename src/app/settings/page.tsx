"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Settings,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  User,
  GraduationCap,
  Sparkles,
  LogOut,
  ShieldAlert,
} from "lucide-react";

export default function AccountSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Password Change Form State
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
        } else {
          router.push("/login");
        }
      } catch (err) {
        console.error(err);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [router]);

  // Password strength calculation
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

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] text-white flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">جاري تحميل إعدادات الحساب...</p>
        </div>
      </div>
    );
  }

  const roleLabel =
    user?.role === "SUPER_ADMIN"
      ? "مدير النظام العام (Super Admin)"
      : user?.role === "STAFF"
      ? "موظف بصمة معتمد (Staff)"
      : "طالب مقيد بالكلية (Student)";

  const returnLink =
    user?.role === "SUPER_ADMIN" || user?.role === "STAFF" ? "/admin" : "/booking";

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-arabic py-8 px-4 sm:px-6 lg:px-8 selection:bg-blue-600 selection:text-white">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Navigation & Actions */}
        <div className="flex items-center justify-between">
          <Link
            href={returnLink}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى {user?.role === "STUDENT" ? "بوابة الحجز" : "لوحة العمليات"}</span>
          </Link>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400 hover:text-white transition px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>

        {/* Page Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Settings className="w-7 h-7 text-blue-400" />
            <span>إعدادات الحساب والأمان</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            إدارة إعدادات حسابك الشخصي، استعراض الصلاحيات، وتحديث كلمة المرور لحماية حسابك بالمنظومة.
          </p>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl border text-sm font-medium flex items-center justify-between animate-fade-in ${
              feedback.type === "success"
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                : "bg-red-950/40 border-red-500/40 text-red-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
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

        {/* Account Info Card (Read Only) */}
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 sm:p-7 shadow-2xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-blue-400" />
              <span>بيانات الحساب المعتمدة</span>
            </h2>
            <span className="text-[11px] text-emerald-400 font-bold px-2.5 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              حساب موثق ونشط
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 space-y-1">
              <span className="text-slate-400 font-medium block">اسم صاحب الحساب:</span>
              <span className="font-bold text-white text-sm">{user?.fullName || "—"}</span>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 space-y-1">
              <span className="text-slate-400 font-medium block">
                {user?.role === "STUDENT" ? "الرقم الأكاديمي الجامعي:" : "البريد الإلكتروني الجامعي:"}
              </span>
              <span className="font-mono font-bold text-cyan-300 text-sm">
                {user?.email || user?.academicNumber || "—"}
              </span>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 space-y-1">
              <span className="text-slate-400 font-medium block">الدور والصلاحية:</span>
              <span className="font-bold text-purple-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                {roleLabel}
              </span>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 space-y-1">
              <span className="text-slate-400 font-medium block">صلاحية تعديل البيانات:</span>
              <span className="font-bold text-slate-300">
                مقتصرة على مدير النظام العام (Super Admin)
              </span>
            </div>
          </div>
        </div>

        {/* Change Password Card */}
        <div className="bg-gradient-to-br from-[#0c1322] via-slate-900 to-[#0b101c] rounded-3xl border border-blue-500/30 p-6 sm:p-7 shadow-2xl backdrop-blur-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">تعديل وتحديث كلمة المرور</h2>
                <p className="text-[11px] text-slate-400">قم بتعيين كلمة مرور قوية لتأمين حسابك</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                {user?.role === "STUDENT"
                  ? "كلمة المرور الحالية (أو الرقم القومي إذا لم تغيرها من قبل):"
                  : "كلمة المرور الحالية:"}
              </label>
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
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
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

                {/* Password strength indicator */}
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
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
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
    </div>
  );
}
