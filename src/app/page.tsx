import Link from "next/link";
import {
  UserPlus,
  Ticket,
  ArrowLeft,
  Send,
  Calendar,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-slate-950 selection:bg-blue-600 selection:text-white" dir="rtl">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 -right-24 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-24 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-3/4 left-1/3 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl w-full space-y-12 relative z-10 text-center">
        {/* Version 3.1 Celebratory Ribbon */}
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-gradient-to-r from-blue-900/40 via-indigo-900/50 to-purple-900/40 border border-blue-500/30 text-blue-200 text-xs font-bold shadow-xl backdrop-blur-xl animate-fade-in">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-blue-600/30 border border-blue-400/40 font-mono text-[10px] text-blue-300">
            RELEASE v3.1
          </span>
          <span>إطلاق التحديث 3.1 الرسمي لمنظومة البصمة • سرعة معالجة فائقة وتكامل ذكي مع تيليجرام</span>
        </div>

        {/* University Hero Header */}
        <div className="space-y-4 max-w-3xl mx-auto">
          <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-3xl bg-white p-2.5 shadow-2xl shadow-blue-500/20 border-2 border-slate-700/80 flex items-center justify-center hover:scale-105 transition-transform duration-300">
            <img
              src="/images/batu-logo.png"
              alt="شعار جامعة برج العرب التكنولوجية"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-slate-300 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>جامعة برج العرب التكنولوجية • كلية تكنولوجيا الصناعة والطاقة</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight">
            بوابة منظومة بصمة الوجه الذكية
          </h1>

          <p className="text-xs sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            المنصة المركزية المعتمدة لطلاب الفرقة الثانية (قسم تكنولوجيا المعلومات) لحجز مواعيد توثيق بصمة الوجه، ومتابعة حركة الطابور، والربط اللحظي مع بوت تيليجرام.
          </p>

          {/* Quick CTA Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/booking"
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-emerald-600/25 transition transform active:scale-95 flex items-center gap-2"
            >
              <Ticket className="w-4 h-4" />
              <span>حجز الدور برقمك الأكاديمي</span>
            </Link>

            <Link
              href="/schedules"
              className="px-5 py-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800 font-bold text-xs sm:text-sm transition flex items-center gap-2"
            >
              <Calendar className="w-4 h-4 text-purple-400" />
              <span>جدول المواعيد المعتمد</span>
            </Link>
          </div>
        </div>

        {/* Direct Links Grid - 3 Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-right">
          {/* Link 1: Register */}
          <Link
            href="/register"
            className="group flex flex-col justify-between p-6 sm:p-7 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 shadow-xl hover:shadow-2xl hover:shadow-blue-600/10 transition-all duration-300 backdrop-blur-xl relative overflow-hidden"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <UserPlus className="w-6 h-6" />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  الخدمة الأولى
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white group-hover:text-blue-300 transition-colors">
                  تسجيل بيانات الطالب وربط التيليجرام
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed pt-1">
                  تسجيل الاسم والرقم الأكاديمي والسكشن وقسم (A / B) وربط حساب التيليجرام لاستقبال الإشعارات وتأكيد الحضور.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-blue-400">
              <span>تسجيل البيانات والربط</span>
              <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Link 2: Booking */}
          <Link
            href="/booking"
            className="group flex flex-col justify-between p-6 sm:p-7 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 shadow-xl hover:shadow-2xl hover:shadow-emerald-600/10 transition-all duration-300 backdrop-blur-xl relative overflow-hidden"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Ticket className="w-6 h-6" />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  الخدمة الثانية • الأكثر استخداماً
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white group-hover:text-emerald-300 transition-colors">
                  حجز دور البصمة ومتابعة الطابور
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed pt-1">
                  حجز رقم دور فوري في السكشن والقسم الخاص بك ومتابعة حركة الطابور وعدد الطلاب أمامك لحظة بلحظة.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-emerald-400">
              <span>حجز الدور ومتابعة النداء</span>
              <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Link 3: Certified Schedule */}
          <Link
            href="/schedules"
            className="group flex flex-col justify-between p-6 sm:p-7 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-purple-500/50 shadow-xl hover:shadow-2xl hover:shadow-purple-600/10 transition-all duration-300 backdrop-blur-xl relative overflow-hidden"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Calendar className="w-6 h-6" />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  <span>الخدمة الثالثة • معتمد رسمي</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white group-hover:text-purple-300 transition-colors">
                  جدول مواعيد تسجيل بصمة الوجه المعتمد
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed pt-1">
                  الجدول الرسمي المعتمد لتسجيل بصمة الوجه للسكاشن وتقسيمتي (A و B) ومقرات اللجان، مع إمكانية تصدير وطباعة PDF.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-purple-400">
              <span>استعراض الجدول وطباعة PDF</span>
              <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>

        {/* Telegram Notice Card */}
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-[#0b101d] via-slate-900 to-[#0b101d] border border-slate-800/80 text-xs text-slate-300 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 flex-shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div className="text-right">
              <div className="font-bold text-white">
                البوت الرسمي المعتمد لتلقي إشعارات الأدوار وأوقات الحضور
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                تأكد من فتح التيليجرام والضغط على <b className="text-sky-300">/start</b> لتفعيل الإشعارات وتلقي كود التأكيد
              </div>
            </div>
          </div>

          <a
            href="https://t.me/batu_face_id_bot"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono font-bold text-xs transition flex items-center gap-2 flex-shrink-0"
          >
            <span>@batu_face_id_bot</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

