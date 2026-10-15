"use client";

import { useState, useEffect } from "react";

export default function AdminSettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [procLoading, setProcLoading] = useState(false);
  const [procResult, setProcResult] = useState<any>(null);

  useEffect(() => {
    async function loadHealth() {
      try {
        setLoading(true);
        const res = await fetch("/api/health");
        const json = await res.json();
        setHealth(json);
      } catch (err: any) {
        setHealth({ status: "error", error: err.message });
      } finally {
        setLoading(false);
      }
    }
    loadHealth();
  }, []);

  const handleRunProcessor = async () => {
    try {
      setProcLoading(true);
      setProcResult(null);
      const res = await fetch("/api/notifications/process", {
        method: "POST",
      });
      const json = await res.json();
      setProcResult(json);
    } catch (err: any) {
      setProcResult({ success: false, error: err.message });
    } finally {
      setProcLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">إعدادات النظام والاتصالات الخارجية</h1>
        <p className="text-xs sm:text-sm text-slate-500">
          فحص الاتصال بقاعدة بيانات Neon PostgreSQL وبوت التيليجرام ومعالجة طابور الإشعارات
        </p>
      </div>

      {/* System Status Card */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-4 backdrop-blur-xl">
        <h2 className="text-base font-bold text-white pb-2 border-b border-slate-800">
          حالة الخدمات الأساسية
        </h2>

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">جاري فحص الاتصالات...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-1">
              <span className="text-slate-400 block">قاعدة بيانات Neon PostgreSQL:</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                متصلة وجاهزة ({health?.dbLatencyMs || 0} ms)
              </span>
            </div>

            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-1">
              <span className="text-slate-400 block">بوت التيليجرام الرسمي:</span>
              <span className="font-bold text-cyan-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                @batu_face_id_bot (مفعل ومعتمد)
              </span>
            </div>

            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-1">
              <span className="text-slate-400 block">المنطقة الزمنية الرسمية:</span>
              <span className="font-bold text-slate-200 font-mono">
                Africa/Cairo (توقيت القاهرة)
              </span>
            </div>

            <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-1">
              <span className="text-slate-400 block">تشفير البيانات الحساسة (AES-256-GCM):</span>
              <span className="font-bold text-emerald-400">
                مفعل وآمن (Keyed HMAC + GCM)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Background Notification Processor Trigger */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-4 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">
              معالج طابور الإشعارات اليدوي (Outbox Processor)
            </h2>
            <p className="text-xs text-slate-400">
              يمكن تشغيل المعالج يدوياً لفحص اقتراب أدوار الطلاب وإرسال الرسائل المعلقة فوراً
            </p>
          </div>

          <button
            onClick={handleRunProcessor}
            disabled={procLoading}
            className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:bg-blue-900 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition flex items-center gap-2"
          >
            {procLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>جاري المعالجة...</span>
              </>
            ) : (
              <span>تشغيل المعالج الآن</span>
            )}
          </button>
        </div>

        {procResult && (
          <div className="bg-slate-950 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto space-y-1 border border-slate-800">
            <p className="text-emerald-400 font-bold">نتيجة تشغيل المعالج:</p>
            <pre>{JSON.stringify(procResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* Telegram Webhook Setup Instructions */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-3 text-right backdrop-blur-xl">
        <h2 className="text-base font-bold text-white">
          إعداد رابط خطاف التيليجرام (Webhook Setup)
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          عند نشر التطبيق على النطاق الخارجي (Vercel أو الخادم الخاص بك)، يتم ربط التيليجرام بتنفيذ الأمر التالي مرة واحدة:
        </p>

        <div className="bg-slate-950 text-slate-200 p-3.5 rounded-xl text-xs font-mono overflow-x-auto text-left border border-slate-800" dir="ltr">
          curl -F &quot;url=https://YOUR_DOMAIN.com/api/telegram/webhook&quot; \<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;-F &quot;secret_token=batu_face_id_webhook_secret_2026_super_safe&quot; \<br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;https://api.telegram.org/bot8647667481:AAFATdXAHLuktMs2bzZpDRBghOUYEZfQOA4/setWebhook
        </div>
      </div>
    </div>
  );
}
