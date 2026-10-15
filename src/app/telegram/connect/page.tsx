"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Send, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

export default function TelegramConnectPage() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [linkData, setLinkData] = useState<{
    token: string;
    deepLink: string;
    expiresAt: string;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check auth user & linking state
  useEffect(() => {
    async function checkStatus() {
      try {
        setLoading(true);
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.success && json.data.user) {
          setCurrentUser(json.data.user);

          // If student, check if profile has telegramUserId
          if (json.data.user.role === "STUDENT" && json.data.user.studentId) {
            const studentRes = await fetch(`/api/students/${json.data.user.studentId}`);
            const studentJson = await studentRes.json();
            if (studentJson.success) {
              setCurrentUser((prev: any) => ({ ...prev, ...studentJson.data.student }));
            }
          }
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, []);

  // Generate new linking token
  const handleGenerateToken = async () => {
    try {
      setGenerating(true);
      setError(null);
      const res = await fetch("/api/telegram/link-token", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "فشل إنشاء رابط الربط، يرجى تسجيل الدخول كطالب أولاً");
        return;
      }
      setLinkData(json.data);
    } catch (err: any) {
      setError(err.message || "فشل الاتصال بالخادم");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-xl mx-auto w-full">
      <div className="bg-slate-900/90 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-xl">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/30 shadow-inner">
            <Send className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-white">ربط حساب التيليجرام</h1>
          <p className="text-xs sm:text-sm text-slate-400">
            بوت نظام تسجيل بصمة الوجه — جامعة برج العرب التكنولوجية
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs sm:text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {currentUser?.telegramUserId ? (
          /* Already Linked View */
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-white text-lg">
              حساب التيليجرام مربوط بنجاح
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              حسابك مرتبط حالياً بالبوت الرسمي (<b>@batu_face_id_bot</b>). ستصلك كافة إشعارات
              المواعيد واقتراب دورك وتأكيد التفعيل مباشرة.
            </p>
            <div className="pt-2">
              <Link
                href="/booking"
                className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold transition shadow-lg shadow-blue-600/30"
              >
                <span>الانتقال لصفحة الحجز</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          /* Needs Linking View */
          <div className="space-y-5 text-right">
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 text-xs sm:text-sm text-slate-300 space-y-2 leading-relaxed">
              <p className="font-bold text-white">لماذا يجب ربط حسابك بالتيليجرام؟</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>إشعار فوري عند فتح موعد الحجز للسكشن الخاص بك.</li>
                <li>تأكيد حجز رقم دورك في قائمة الانتظار.</li>
                <li>تنبيه تلقائي عند تبقي 10 طلاب و 5 طلاب فقط على دورك.</li>
                <li>إشعار رسمي بنجاح تفعيل بصمة الوجه من موظف البصمة.</li>
              </ul>
            </div>

            {linkData ? (
              <div className="bg-blue-950/40 border border-blue-500/30 rounded-2xl p-5 text-center space-y-3">
                <p className="text-xs sm:text-sm text-blue-200 font-semibold">
                  تم إنشاء رابط الربط المشفر الآمن. اضغط على الزر التالي لفتح البوت والضغط على Start:
                </p>
                <a
                  href={linkData.deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition"
                >
                  فتح البوت وإتمام الربط (Link Telegram Account)
                </a>
                <p className="text-xs text-slate-500">
                  صلاحية الرابط: 15 دقيقة لمرة واحدة فقط.
                </p>
              </div>
            ) : (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGenerateToken}
                  disabled={generating}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:bg-blue-900 text-white font-bold text-sm shadow-xl shadow-blue-600/30 transition flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري توليد الرابط الآمن...</span>
                    </>
                  ) : (
                    <span>إنشاء رابط الربط (Link Telegram Account)</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
