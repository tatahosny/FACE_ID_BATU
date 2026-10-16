import Link from "next/link";
import { UserPlus, Ticket, ArrowLeft, Send, Calendar, Clock, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden bg-slate-950">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl w-full space-y-10 relative z-10 text-center">
        {/* University Header */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>جامعة برج العرب التكنولوجية • كلية تكنولوجيا الصناعة والطاقة</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            بوابة منظومة بصمة الوجه
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            قسم تكنولوجيا المعلومات (الفرقة الثانية) — المنظومة الرسمية لحجز المواعيد وتنظيم طوابير البصمة البيومترية:
          </p>
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
                  الخدمة الثانية
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
                  <span>الخدمة الثالثة • معتمد</span>
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

        {/* Telegram Notice */}
        <div className="p-4 rounded-2xl bg-[#0b101d] border border-slate-800/80 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-center gap-2">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              البوت الرسمي المعتمد لتلقي إشعارات الأدوار وأوقات الحضور:{" "}
              <a
                href="https://t.me/batu_face_id_bot"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 font-mono font-bold hover:underline"
              >
                @batu_face_id_bot
              </a>
            </span>
          </div>
          <span className="hidden sm:inline text-slate-600">•</span>
          <span className="text-slate-500">
            تأكد من فتح التيليجرام والضغط على <b className="text-slate-300">/start</b> لتفعيل الإشعارات
          </span>
        </div>
      </div>
    </div>
  );
}
