"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Ticket,
  GraduationCap,
  Clock,
  Calendar,
  Building2,
  Folder,
  Volume2,
  FileText,
  Mail,
  Users,
  ShieldCheck,
  Settings,
  LogOut,
  Radio,
  Menu,
  X,
  ExternalLink,
  Landmark,
  Zap,
  LogIn,
  AlertTriangle,
  KeyRound,
  Star,
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("ar-EG", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function verifyAuth() {
      try {
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.success && json.data?.user) {
          setSessionUser(json.data.user);
        } else {
          setSessionUser(null);
        }
      } catch {
        setSessionUser(null);
      } finally {
        setAuthLoaded(true);
      }
    }
    verifyAuth();
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setSessionUser(null);
    router.push("/login");
  };

  const isSuperAdmin = sessionUser?.role === "SUPER_ADMIN";
  const isStaff = sessionUser?.role === "STAFF";
  const staffAllowedHrefs = new Set([
    "/admin",
    "/admin/desk-t",
    "/admin/desk-d",
    "/admin/queues",
    "/admin/students",
    "/admin/account-settings",
  ]);

  // Route protection guard: redirect STAFF from restricted pages
  useEffect(() => {
    if (!authLoaded || !sessionUser) return;
    if (sessionUser.role === "STAFF") {
      if (!staffAllowedHrefs.has(pathname) && pathname.startsWith("/admin")) {
        router.replace("/admin");
      }
    }
  }, [authLoaded, sessionUser, pathname, router]);

  const navSections = [
    {
      title: "غرفة العمليات والشبابيك",
      items: [
        { label: "لوحة القيادة والمؤشرات", href: "/admin", icon: LayoutDashboard },
        { label: "شباك T (طابور العمليات)", href: "/admin/desk-t", icon: Ticket, highlight: true },
        { label: "شباك D (طابور العمليات)", href: "/admin/desk-d", icon: Ticket, highlight: true },
        { label: "مراقبة كل الأدوار (T + D)", href: "/admin/queues", icon: Ticket },
        { label: "دليل الطلاب وسجل حالة البصمة", href: "/admin/students", icon: GraduationCap, highlight: true },
        { label: "فترات وضوابط الحجز", href: "/admin/booking-windows", icon: Clock },
      ],
    },
    {
      title: "الجداول والأكاديميا",
      items: [
        { label: "جدول المواعيد وتصدير PDF", href: "/admin/schedules", icon: Calendar, highlight: true },
        { label: "المجموعات الدراسية", href: "/admin/groups", icon: Building2 },
        { label: "السكاشن الأكاديمية", href: "/admin/sections", icon: Folder },
      ],
    },
    {
      title: "الاتصالات والإشعارات",
      items: [
        { label: "حملات التيليجرام الجماعية", href: "/admin/telegram", icon: Volume2 },
        { label: "تقييمات الطلاب وآرائهم", href: "/admin/ratings", icon: Star },
        { label: "قوالب الرسائل الذكية", href: "/admin/templates", icon: FileText },
        { label: "سجلات تسليم الإشعارات", href: "/admin/notifications", icon: Mail },
      ],
    },
    {
      title: "الأمان وإدارة المنظومة",
      items: [
        { label: "إعدادات الحساب وكلمة المرور", href: "/admin/account-settings", icon: KeyRound, highlight: true },
        { label: "طاقم عمل وموظفي البصمة", href: "/admin/staff", icon: Users },
        { label: "سجل التدقيق الأمني (Audit)", href: "/admin/audit-logs", icon: ShieldCheck },
        { label: "إعدادات النظام العامة", href: "/admin/settings", icon: Settings },
      ],
    },
  ];

  // Restrict navigation for Staff: only show dashboard, queues, and students
  const visibleNavSections = isStaff
    ? navSections
        .map((sec) => ({
          ...sec,
          items: sec.items.filter((item) => staffAllowedHrefs.has(item.href)),
        }))
        .filter((sec) => sec.items.length > 0)
    : navSections;

  return (
    <div className="h-screen max-h-screen bg-[#070b14] text-slate-100 flex flex-col font-arabic selection:bg-blue-600 selection:text-white overflow-hidden">
      {/* Top Banner if Logged Out */}
      {authLoaded && !sessionUser && (
        <div className="flex-shrink-0 bg-amber-950/90 border-b border-amber-500/40 text-amber-200 px-4 py-2.5 text-xs flex flex-col sm:flex-row items-center justify-between gap-2 shadow-lg z-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="font-bold">تنبيه: أنت تتصفح لوحة التحكم كزائر غير مسجل الدخول.</span>
            <span className="text-amber-300/80 text-[11px] hidden md:inline">
              سجلات الطلاب المشفرة والطوابير تتطلب تسجيل الدخول بحساب المشرف.
            </span>
          </div>
          <Link
            href="/login"
            className="px-3.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow flex items-center gap-1"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>تسجيل الدخول كـ Super Admin</span>
          </Link>
        </div>
      )}

      {/* Dedicated High-Tech Top Bar (Autonomous Admin Header) */}
      <header className="flex-shrink-0 z-40 bg-[#0d1322]/90 backdrop-blur-xl border-b border-blue-900/40 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-2xl gap-2">
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
          {/* Mobile Sidebar Toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex-shrink-0 active:scale-95 transition"
            aria-label="تبديل القائمة الجانبية"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Command Center Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white p-1 shadow-lg shadow-blue-500/20 border border-slate-700 flex items-center justify-center flex-shrink-0">
              <img
                src="/images/batu-logo.png"
                alt="BATU Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-xs sm:text-base tracking-wide bg-gradient-to-r from-white via-slate-200 to-blue-300 bg-clip-text text-transparent truncate">
                  BATU COMMAND
                </span>
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold border flex-shrink-0 ${
                  isStaff
                    ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                }`}>
                  {isStaff ? "STAFF" : "ADMIN"}
                </span>
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 hidden sm:flex items-center gap-2 truncate">
                <span>جامعة برج العرب</span>
                <span>•</span>
                <span className="text-blue-400 truncate">
                  {isStaff ? "بوابة طاقم موظفي البصمة" : "إدارة منظومة بصمة الوجه"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Indicators & Clock */}
        <div className="flex items-center gap-2 sm:gap-6 flex-shrink-0">
          {/* Live System Diagnostics */}
          <div className="hidden lg:flex items-center gap-3 text-xs bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Neon DB</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-1.5 text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>Telegram Bot</span>
            </div>
            <span className="text-slate-700">|</span>
            <div className="text-slate-300 font-mono text-[11px] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentTime || "جاري التحديث..."}</span>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="hidden sm:flex items-center gap-1.5">
            <Link
              href="/admin/desk-t"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 border shadow-sm ${
                pathname === "/admin/desk-t"
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-cyan-500/20"
                  : "bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/40 border-cyan-500/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>شباك T</span>
            </Link>
            <Link
              href="/admin/desk-d"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1 border shadow-sm ${
                pathname === "/admin/desk-d"
                  ? "bg-purple-600 text-white border-purple-400 shadow-purple-600/20"
                  : "bg-purple-950/40 text-purple-300 hover:bg-purple-900/40 border-purple-500/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span>شباك D</span>
            </Link>
            <Link
              href="/admin/queues"
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border ${
                pathname === "/admin/queues"
                  ? "bg-blue-600 text-white border-blue-400"
                  : "bg-slate-900/80 text-slate-300 hover:text-white border-slate-800"
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>كل الأدوار</span>
            </Link>
            <Link
              href="/"
              target="_blank"
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden md:inline">بوابة الطلاب</span>
            </Link>
          </div>

          {/* Admin Avatar & Logout / Login */}
          <div className="flex items-center gap-2 sm:gap-3 pl-1 border-r border-slate-800 pr-2 sm:pr-3">
            {sessionUser ? (
              <>
                <Link
                  href="/admin/account-settings"
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm text-white shadow-md border hover:scale-105 transition flex-shrink-0 ${
                    isStaff
                      ? "bg-gradient-to-tr from-cyan-700 to-blue-800 border-cyan-500/40"
                      : "bg-gradient-to-tr from-blue-700 to-indigo-800 border-blue-500/40"
                  }`}
                  title="إعدادات الحساب وتغيير كلمة المرور"
                >
                  {isStaff ? "ST" : "SA"}
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition text-xs font-bold flex items-center gap-1"
                  title="تسجيل الخروج"
                >
                  <LogOut className="w-4 h-4 text-red-400" />
                  <span className="hidden xs:inline">خروج</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition flex items-center gap-1"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span className="text-[11px] sm:text-xs">دخول</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Admin Workspace: Futuristic Sidebar + Canvas */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Sleek Command Sidebar */}
        <aside
          className={`fixed md:relative inset-y-0 right-0 z-50 md:z-30 w-72 h-full bg-[#0b101d] border-l border-blue-900/30 flex flex-col justify-between transition-transform duration-300 ease-in-out md:translate-x-0 flex-shrink-0 shadow-2xl md:shadow-none ${
            sidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Mobile Close Button Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-slate-900 md:hidden flex-shrink-0 bg-[#080c16]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white p-1">
                <img src="/images/batu-logo.png" alt="BATU" className="w-full h-full object-contain" />
              </div>
              <span className="font-bold text-xs text-white">قائمة لوحة التحكم</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white"
              aria-label="إغلاق القائمة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Nav List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar min-h-0">
            {visibleNavSections.map((sec, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-1 flex items-center justify-between">
                  <span>{sec.title}</span>
                  <span className="w-8 h-px bg-slate-800" />
                </div>
                {sec.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group ${
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 font-bold border border-blue-400/30"
                          : item.highlight
                          ? "bg-slate-900/80 text-blue-300 hover:bg-slate-800 hover:text-white border border-blue-900/40"
                          : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                            isActive ? "text-white" : item.highlight ? "text-blue-400" : "text-slate-400"
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-sm shadow-cyan-300 animate-ping" />
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Sidebar Footer Info */}
          <div className="p-4 border-t border-slate-900 bg-[#080c16] space-y-2 flex-shrink-0">
            <div className="bg-blue-950/40 border border-blue-900/30 p-2.5 rounded-xl text-[11px] text-blue-300/90 flex items-center justify-between">
              <div>
                <div className="font-bold">جامعة برج العرب</div>
                <div className="text-[10px] text-slate-400">قسم تكنولوجيا المعلومات</div>
              </div>
              <Landmark className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-[10px] text-slate-400 text-center font-mono">
              نظام بصمة الوجه الذكي v3.1
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile sidebar */}
        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}

        {/* Main Command Workspace */}
        <main className="flex-1 h-full overflow-y-auto min-h-0 bg-gradient-to-b from-[#070b14] via-[#090e1a] to-[#070b14] p-3.5 sm:p-6 lg:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
