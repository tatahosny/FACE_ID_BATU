"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Admin routes have their own full-screen Command Center layout
  if (pathname?.startsWith("/admin")) {
    return <>{children}</>;
  }

  // Staff routes have their own dedicated sidebar layout
  if (pathname?.startsWith("/staff")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Top University Public Navbar */}
      <header className="print:hidden sticky top-0 z-40 bg-slate-950/85 backdrop-blur-xl border-b border-slate-900 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white p-1 flex items-center justify-center shadow-lg shadow-blue-500/10 border border-slate-700/50 group-hover:scale-105 transition">
              <img
                src="/images/batu-logo.png"
                alt="شعار جامعة برج العرب التكنولوجية"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black text-white group-hover:text-blue-400 transition leading-tight">
                  جامعة برج العرب التكنولوجية
                </span>
                <span className="px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-[9px] font-bold">
                  v3.1
                </span>
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                منظومة تسجيل بصمة الوجه • قسم تكنولوجيا المعلومات
              </div>
            </div>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2 text-xs font-bold">
            <Link
              href="/register"
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl transition ${
                pathname === "/register"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "text-slate-300 hover:text-white hover:bg-slate-900"
              }`}
            >
              تسجيل البيانات
            </Link>
            <Link
              href="/booking"
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl transition ${
                pathname === "/booking"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-slate-300 hover:text-white hover:bg-slate-900"
              }`}
            >
              حجز الدور
            </Link>
            <Link
              href="/schedules"
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl transition ${
                pathname === "/schedules"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                  : "text-slate-300 hover:text-white hover:bg-slate-900"
              }`}
            >
              جدول المواعيد
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">{children}</main>

      {/* Minimal Clean Public Footer */}
      <footer className="print:hidden bg-slate-950 border-t border-slate-900 text-slate-500 py-6 px-4 text-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white p-0.5 flex items-center justify-center border border-slate-800">
              <img
                src="/images/batu-logo.png"
                alt="BATU"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="font-bold text-slate-300">جامعة برج العرب التكنولوجية (BATU)</span>
              <span className="mx-1.5 text-slate-600">•</span>
              <span className="text-slate-400">كلية تكنولوجيا الصناعة والطاقة</span>
            </div>
          </div>

          <div className="flex items-center flex-wrap justify-center gap-3 sm:gap-4 text-[11px] text-slate-400">
            <Link href="/register" className="hover:text-blue-400 transition">
              تسجيل البيانات
            </Link>
            <span>•</span>
            <Link href="/booking" className="hover:text-blue-400 transition">
              حجز الدور والمتابعة
            </Link>
            <span>•</span>
            <Link href="/schedules" className="hover:text-blue-400 transition text-slate-200 font-bold">
              جدول المواعيد المعتمد
            </Link>
            <span>•</span>
            <Link href="/settings" className="hover:text-blue-400 transition">
              إعدادات الحساب
            </Link>
            <span>•</span>
            <a
              href="https://t.me/batu_face_id_bot"
              target="_blank"
              rel="noreferrer"
              className="hover:text-sky-400 transition font-mono font-bold text-sky-400"
            >
              @batu_face_id_bot
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
