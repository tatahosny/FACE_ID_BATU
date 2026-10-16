"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const navItems = [
    { label: "لوحة العمليات", href: "/staff" },
    { label: "إدارة الطابور والنداء", href: "/staff/queue" },
    { label: "البحث عن طالب", href: "/staff/students" },
    { label: "سجلات التفعيل", href: "/staff/activations" },
  ];

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-slate-950 text-slate-100 min-h-[calc(100vh-64px)]">
      {/* Staff Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900/95 backdrop-blur-xl text-white p-5 flex flex-col justify-between border-b md:border-b-0 md:border-l border-slate-800 shadow-xl">
        <div className="space-y-6">
          <div className="pb-4 border-b border-slate-800 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white p-1 flex items-center justify-center flex-shrink-0 border border-slate-700 shadow-md">
              <img
                src="/images/batu-logo.png"
                alt="BATU"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold block">
                بوابة موظفي البصمة
              </span>
              <h2 className="text-base font-bold text-white leading-tight">
                مكتب تفعيل بصمة الوجه
              </h2>
              <p className="text-[11px] text-slate-400">قسم تكنولوجيا المعلومات • BATU</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700/50 text-xs font-semibold transition shadow-sm"
          >
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main Staff Content */}
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
