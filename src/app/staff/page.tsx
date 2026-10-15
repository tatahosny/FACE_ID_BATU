"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, Search, CheckCircle2, ShieldAlert, Sparkles, UserCheck } from "lucide-react";

export default function StaffOverviewPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.success) {
          setCurrentUser(json.data.user);
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadUser();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Welcome banner */}
      <div className="bg-slate-900/90 rounded-3xl border border-slate-800 shadow-xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 backdrop-blur-xl">
        <div className="space-y-1.5 text-center sm:text-right">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">مرحباً بك</span>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            {currentUser?.fullName || "موظف البصمة المعتمد"}
          </h1>
          <p className="text-sm text-slate-400">
            أنت مسجل بصلاحية: <b className="text-slate-200">{currentUser?.role === "SUPER_ADMIN" ? "مدير النظام" : "موظف بصمة"}</b>
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap gap-3">
          <Link
            href="/staff/queue"
            className="flex items-center gap-2 py-3 px-5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-md shadow-blue-600/30 transition"
          >
            <Users className="w-4 h-4" />
            فتح طابور الانتظار والنداء
          </Link>
          <Link
            href="/staff/students"
            className="flex items-center gap-2 py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-sm shadow-sm transition"
          >
            <Search className="w-4 h-4" />
            بحث فوري عن طالب
          </Link>
        </div>
      </div>

      {/* Operational Guidelines Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-xl space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-black text-lg">
            1
          </div>
          <h3 className="font-bold text-white text-base">مناداة الطالب</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            اضغط على زر «نداء التالي» في شاشة الطابور. سيصل إشعار فوري للطالب على التيليجرام بالتوجه لمكتبك.
          </p>
        </div>

        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-xl space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-black text-lg">
            2
          </div>
          <h3 className="font-bold text-white text-base">التحقق من الهوية</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            اطلب أصل بطاقة الرقم القومي أو كارنيه الكلية وتأكد من مطابقة الاسم والرقم الأكاديمي.
          </p>
        </div>

        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl backdrop-blur-xl space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-lg">
            3
          </div>
          <h3 className="font-bold text-white text-base">تسجيل وتأكيد البصمة</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            التقط بصمة الوجه واضغط على «تأكيد التفعيل». سيتم إرسال إشعار رسمي موثق باسمك إلى تيليجرام الطالب.
          </p>
        </div>
      </div>
    </div>
  );
}
