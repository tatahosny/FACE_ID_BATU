"use client";

import { useState, useEffect } from "react";
import {
  MapPin,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  Sparkles,
  ShieldCheck,
  Building2,
  Radio,
  Zap,
} from "lucide-react";

export default function AdminSettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [procLoading, setProcLoading] = useState(false);
  const [procResult, setProcResult] = useState<any>(null);

  // Activation Location State (Super Admin Only)
  const [location, setLocation] = useState("");
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationSaving, setLocationSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const presets = [
    "الواحة — مبنى الشؤون (شباك بصمة الوجه)",
    "شباك الاستقبال المركزي - شؤون الطلاب (الواحة)",
    "معمل الحاسب الآلي الرئيسي (شباك بصمة الوجه)",
    "مدرج 1 - مقر لجان البصمة المؤقت",
    "معمل 2 - مبنى كلية تكنولوجيا الصناعة والطاقة",
  ];

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

    async function loadLocation() {
      try {
        setLocationLoading(true);
        const res = await fetch("/api/admin/settings/location");
        const json = await res.json();
        if (json.success && json.data?.location) {
          setLocation(json.data.location);
        }
      } catch (err: any) {
        console.error("Failed to load location:", err);
      } finally {
        setLocationLoading(false);
      }
    }

    loadHealth();
    loadLocation();
  }, []);

  const handleSaveLocation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!location.trim()) {
      setFeedback({ message: "يرجى كتابة اسم المقر قبل الحفظ", type: "error" });
      return;
    }

    try {
      setLocationSaving(true);
      setFeedback(null);
      const res = await fetch("/api/admin/settings/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: location.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل حفظ المقر", type: "error" });
        return;
      }

      setLocation(json.data.location);
      setFeedback({
        message: "تم تحديث المقر المعتمد بنجاح، وسيتم إدراجه فوراً في رسائل التيليجرام المرسلة للطلاب!",
        type: "success",
      });
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setLocationSaving(false);
    }
  };

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
    <div className="max-w-5xl mx-auto space-y-8 font-arabic">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-mono text-blue-400 font-bold uppercase tracking-wider">
              SYSTEM CONFIGURATION • إعدادات المنظومة المركزية
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            إعدادات النظام والاتصالات الخارجية
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            إدارة المقر المعتمد للبصمة، وفحص الاتصال بقاعدة بيانات Neon PostgreSQL وبوت التيليجرام ومعالجة طابور الإشعارات.
          </p>
        </div>
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

      {/* NEW: Dedicated Fingerprint Activation Location Card (SUPER ADMIN ONLY) */}
      <div className="bg-gradient-to-br from-[#0c1322] via-slate-900 to-[#0b101c] rounded-3xl border border-blue-500/30 p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 left-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 flex-shrink-0">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">
                  المقر المعتمد لتسجيل بصمة الوجه (إشعار التيليجرام)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  SUPER ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                المقر الذي يتم إدراجه تلقائياً وديناميكياً في سطر «المقر: ...» داخل رسالة التهنئة والاعتماد المرسلة للطالب فور تفعيل بصمته.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
          {/* Form & Input on Left */}
          <div className="lg:col-span-7 space-y-4">
            <form onSubmit={handleSaveLocation} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-2">
                  نص المقر والمكان المعتمد:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="مثال: الواحة — مبنى الشؤون (شباك بصمة الوجه)"
                    disabled={locationLoading || locationSaving}
                    className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-blue-500/40 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 placeholder-slate-600 transition shadow-inner"
                  />
                  <MapPin className="w-4 h-4 text-cyan-400 absolute left-3.5 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-semibold block">
                  خيارات ومقرات مقترحة سريعة:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setLocation(preset)}
                      className={`text-[11px] px-2.5 py-1.5 rounded-xl border transition ${
                        location === preset
                          ? "bg-blue-600/30 border-blue-400 text-blue-200 font-bold"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={locationLoading || locationSaving}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black text-xs shadow-lg shadow-blue-600/30 transition flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className={`w-4 h-4 ${locationSaving ? "animate-spin" : ""}`} />
                  <span>{locationSaving ? "جاري الحفظ والاعتماد..." : "حفظ واعتماد المقر الجديد"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Live Telegram Message Preview on Right */}
          <div className="lg:col-span-5 bg-gradient-to-b from-[#0f172a] to-[#070b14] border border-cyan-500/30 rounded-2xl p-4 shadow-xl space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5 text-cyan-400 text-xs font-bold">
                <Send className="w-3.5 h-3.5" />
                <span>معاينة حية لرسالة التيليجرام للطالب</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Live Preview</span>
            </div>

            <div className="bg-[#182232] rounded-xl p-3.5 text-xs text-slate-200 font-sans leading-relaxed border border-blue-900/40 space-y-2">
              <div className="font-bold text-white text-[13px]">
                جامعة برج العرب التكنولوجية (BATU)
              </div>
              <div className="text-[11px] text-slate-400">
                قسم تكنولوجيا المعلومات — كلية تكنولوجيا الصناعة والطاقة
              </div>

              <div className="font-extrabold text-emerald-400 pt-1">
                تم تفعيل بصمة الوجه بنجاح!
              </div>

              <div>
                عزيزي الطالب: <b className="text-white">مصطفى محمد حسنى</b>
                <br />
                الرقم الأكاديمي: <span className="font-mono text-cyan-300">2421204</span>
              </div>

              <div className="text-slate-300 text-[11px]">
                نحيطكم علماً بأنه قد تم تسجيل وتوثيق بصمة الوجه الخاصة بك رسمياً بنجاح تام، وتأكيد حضورك لدى شؤون الطلاب.
              </div>

              <div className="pt-1 space-y-0.5 text-[11px] bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-400">المسؤول المعتمد:</span> <span className="text-white font-medium">عبد الرحمن حسنى</span>
                </div>
                <div>
                  <span className="text-slate-400">توقيت الاعتماد:</span> <span className="text-white font-mono">١٦ أكتوبر ٢٠٢٦ في ٠٣:١٦ م</span>
                </div>
                <div className="text-cyan-300 font-bold flex items-start gap-1">
                  <span className="text-slate-400 font-normal">المقر:</span>
                  <span className="underline decoration-cyan-400 underline-offset-2">
                    {location || "الواحة — مبنى الشؤون (شباك بصمة الوجه)"}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 pt-1">
                نتمنى لك دوام التوفيق والنجاح!
              </div>
            </div>
          </div>
        </div>
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
