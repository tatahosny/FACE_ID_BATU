"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, LogIn, Lock, Mail, AlertTriangle } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/admin";

  const [activeTab, setActiveTab] = useState<"staff" | "student">("staff");
  const [identifier, setIdentifier] = useState("admin@batu.edu.eg");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!identifier.trim() || !secret.trim()) {
      setErrorMessage("يرجى إدخال جميع بيانات الدخول");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, secret }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setErrorMessage(json.error || "فشل تسجيل الدخول، تحقق من البريد وكلمة المرور");
        return;
      }

      const role = json.data.user.role;
      if (role === "SUPER_ADMIN") {
        router.push(callbackUrl.startsWith("/admin") ? callbackUrl : "/admin");
      } else if (role === "STAFF") {
        router.push(callbackUrl.startsWith("/admin") ? callbackUrl : "/admin/queues");
      } else {
        router.push("/booking");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "حدث خطأ غير متوقع أثناء الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8 selection:bg-blue-600 selection:text-white">
      <div className="max-w-md w-full bg-slate-900/90 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-xl">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-white p-1.5 flex items-center justify-center mx-auto shadow-xl shadow-blue-600/20 border border-slate-700">
            <img
              src="/images/batu-logo.png"
              alt="جامعة برج العرب التكنولوجية"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-2xl font-black text-white">تسجيل الدخول إلى المنظومة</h1>
          <p className="text-xs text-slate-400">
            جامعة برج العرب التكنولوجية • قسم تكنولوجيا المعلومات
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab("staff");
              setIdentifier("admin@batu.edu.eg");
              setSecret("");
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === "staff"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            بوابة الإدارة والمشرفين (Super Admin)
          </button>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              البريد الإلكتروني للإدارة:
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin@batu.edu.eg"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono text-left"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              كلمة المرور:
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono text-left"
                dir="ltr"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جاري التحقق وتسجيل الدخول...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>دخول لوحة التحكم المركزية</span>
                </>
              )}
            </button>
          </div>
        </form>

        <div className="text-center text-xs text-slate-500 pt-3 border-t border-slate-800 space-y-1">
          <div>
            هل أنت طالب؟{" "}
            <Link href="/booking" className="text-blue-400 hover:underline font-bold">
              حجز موعد البصمة برقمك الأكاديمي مباشرة
            </Link>
          </div>
          <p className="text-[11px] text-slate-500">
            لا توجد حسابات دخول للطلاب — متابعة الدور وموعد البصمة تتم مباشرة عبر بوت تيليجرام.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm font-bold">جاري تحميل الصفحة...</div>}>
      <LoginForm />
    </Suspense>
  );
}
