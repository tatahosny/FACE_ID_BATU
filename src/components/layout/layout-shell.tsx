"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, MapPin, Phone, Radio, Users, Ticket, Bot } from "lucide-react";

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
      {/* Main Content Area - No Top Navbar as requested */}
      <main className="flex-1">{children}</main>

      {/* Minimal Clean Public Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 text-slate-500 py-6 px-4 text-xs">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="font-bold text-slate-400">جامعة برج العرب التكنولوجية (BATU)</span>
            <span>—</span>
            <span>كلية تكنولوجيا الصناعة والطاقة • قسم تكنولوجيا المعلومات</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <Link href="/register" className="hover:text-blue-400 transition">
              تسجيل البيانات
            </Link>
            <span>•</span>
            <Link href="/booking" className="hover:text-blue-400 transition">
              حجز الدور والمتابعة
            </Link>
            <span>•</span>
            <a
              href="https://t.me/batu_face_id_bot"
              target="_blank"
              rel="noreferrer"
              className="hover:text-sky-400 transition font-mono"
            >
              @batu_face_id_bot
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
