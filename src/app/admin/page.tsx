"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/stats");
        const json = await res.json();
        if (json.success && json.data.stats) {
          setStats(json.data.stats);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-28">
        <div className="text-center space-y-4">
          <div className="relative w-12 h-12 mx-auto">
            <div className="w-12 h-12 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-xs text-blue-400">⚡</div>
          </div>
          <p className="text-sm font-medium text-slate-400">جاري مسح ومعالجة مؤشرات المنظومة المركزية...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Controls */}
      <div className="bg-gradient-to-r from-blue-950/60 via-slate-900/80 to-indigo-950/60 border border-blue-900/40 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE TELEMETRY • الفرقة الثانية IT</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              لوحة قيادة منظومة بصمة الوجه الذكية
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              مركز الرصد والتحكم المركزي لحجوزات الطلاب، إدارة تسلسل الطابور الحي، التنبيه المكرر، وتوثيق بصمات الطلاب الأكاديمية لحظياً.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/queues"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 flex items-center gap-2"
            >
              <span>🎟️</span>
              <span>مراقبة الطابور الحي</span>
            </Link>
            <Link
              href="/admin/schedules"
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition flex items-center gap-2"
            >
              <span>🖨️</span>
              <span>جدول المواعيد وPDF</span>
            </Link>
            <Link
              href="/admin/booking-windows"
              className="px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition flex items-center gap-2"
            >
              <span>⏱️</span>
              <span>تفعيل وقت السكاشن</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg space-y-3 relative overflow-hidden group hover:border-blue-500/40 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>الطلاب المسجلين بالنظام</span>
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400">🎓</span>
          </div>
          <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
            {stats?.students?.total || 0}
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>ربط تيليجرام: <b className="text-emerald-400 font-mono">{stats?.students?.linkedTelegram || 0}</b></span>
            <span>قيد الربط: <b className="text-amber-400 font-mono">{stats?.students?.unlinkedTelegram || 0}</b></span>
          </div>
        </div>

        {/* Fingerprint Activations */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg space-y-3 relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>البصمات المفعلة بنجاح</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">✅</span>
          </div>
          <div className="text-3xl sm:text-4xl font-black text-emerald-400 font-mono tracking-tight">
            {stats?.activations?.total || 0}
          </div>
          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>مكتملة وموثقة</span>
            <span className="text-emerald-400 font-medium">معتمدة رسمياً</span>
          </div>
        </div>

        {/* In Queue Waiting */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg space-y-3 relative overflow-hidden group hover:border-amber-500/40 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>في انتظار دور البصمة</span>
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">⏳</span>
          </div>
          <div className="text-3xl sm:text-4xl font-black text-amber-400 font-mono tracking-tight">
            {stats?.bookings?.waiting || 0}
          </div>
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>تم النداء: <b className="text-blue-400 font-mono">{stats?.bookings?.called || 0}</b></span>
            <span>قيد التسجيل: <b className="text-purple-400 font-mono">{stats?.bookings?.inProgress || 0}</b></span>
          </div>
        </div>

        {/* Active Booking Windows */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg space-y-3 relative overflow-hidden group hover:border-cyan-500/40 transition">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>فترات الحجز المفتوحة</span>
            <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">⏱️</span>
          </div>
          <div className="text-3xl sm:text-4xl font-black text-cyan-400 font-mono tracking-tight">
            {stats?.windows?.active || 0}
          </div>
          <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
            <span>سكاشن مفعلة للحجز</span>
            <span className="text-cyan-400 font-medium">متاحة للطلاب</span>
          </div>
        </div>
      </div>

      {/* Operational Breakdown Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bookings Status Breakdown */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">📊</span>
              <h2 className="text-base font-bold text-white">توزيع حالات الطابور</h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              إجمالي الحجوزات: <b className="text-blue-400">{stats?.bookings?.total || 0}</b>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-[#0b101d] rounded-xl p-3.5 border border-slate-800 text-center">
              <span className="text-xs text-slate-400 block mb-1">في الانتظار</span>
              <span className="text-2xl font-black text-amber-400 font-mono">
                {stats?.bookings?.waiting || 0}
              </span>
            </div>
            <div className="bg-[#0b101d] rounded-xl p-3.5 border border-slate-800 text-center">
              <span className="text-xs text-slate-400 block mb-1">تم النداء</span>
              <span className="text-2xl font-black text-blue-400 font-mono">
                {stats?.bookings?.called || 0}
              </span>
            </div>
            <div className="bg-[#0b101d] rounded-xl p-3.5 border border-slate-800 text-center">
              <span className="text-xs text-slate-400 block mb-1">قيد المعالجة</span>
              <span className="text-2xl font-black text-purple-400 font-mono">
                {stats?.bookings?.inProgress || 0}
              </span>
            </div>
            <div className="bg-[#0b101d] rounded-xl p-3.5 border border-slate-800 text-center">
              <span className="text-xs text-slate-400 block mb-1">مكتمل</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">
                {stats?.bookings?.completed || 0}
              </span>
            </div>
            <div className="bg-[#0b101d] rounded-xl p-3.5 border border-slate-800 text-center">
              <span className="text-xs text-slate-400 block mb-1">ملغي لعدم الحضور</span>
              <span className="text-2xl font-black text-red-400 font-mono">
                {stats?.bookings?.cancelled || 0}
              </span>
            </div>
            <div className="bg-[#0b101d] rounded-xl p-3.5 border border-slate-800 text-center">
              <span className="text-xs text-slate-400 block mb-1">لم يحضر</span>
              <span className="text-2xl font-black text-slate-500 font-mono">
                {stats?.bookings?.noShow || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Telegram Notifications Metrics */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">📢</span>
              <h2 className="text-base font-bold text-white">تسليم إشعارات التيليجرام</h2>
            </div>
            <span className="text-xs font-mono text-emerald-400">@batu_face_id_bot Active</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-950/30 rounded-xl p-4 border border-emerald-900/40 text-center">
              <span className="text-xs text-emerald-300 block mb-1">تم التسليم بنجاح</span>
              <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                {stats?.notifications?.delivered || 0}
              </span>
            </div>
            <div className="bg-amber-950/30 rounded-xl p-4 border border-amber-900/40 text-center">
              <span className="text-xs text-amber-300 block mb-1">قيد الإرسال</span>
              <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                {stats?.notifications?.pending || 0}
              </span>
            </div>
            <div className="bg-red-950/30 rounded-xl p-4 border border-red-900/40 text-center">
              <span className="text-xs text-red-300 block mb-1">فشل التسليم</span>
              <span className="text-2xl sm:text-3xl font-black text-red-400 font-mono">
                {stats?.notifications?.failed || 0}
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs text-slate-400 leading-relaxed">
            🚀 النظام يقوم ببث إشعارات فورية لكل من: فتح حجز السكشن، تنبيه اقتراب الدور (10 أدوار و 5 أدوار)، النداء العاجل، وتأخير 10 أدوار، وإلغاء الدور لعدم الحضور.
          </div>
        </div>
      </div>

      {/* Academic Distribution */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span>🏛️</span>
          <span>توزيع الطلاب حسب المجموعات الأكاديمية (الفرقة الثانية)</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats?.students?.perGroup?.map((g: any) => (
            <div
              key={g.groupId}
              className="bg-[#0b101d] rounded-xl p-4 border border-slate-800 flex items-center justify-between"
            >
              <div>
                <span className="font-bold text-white text-sm block">{g.groupName}</span>
                <span className="text-xs text-slate-400 font-mono">{g.groupCode}</span>
              </div>
              <div className="text-lg font-black text-blue-400 font-mono">
                {g.count} طالب
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
