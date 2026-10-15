import "./globals.css";
import type { Metadata } from "next";
import { LayoutShell } from "@/components/layout/layout-shell";

export const metadata: Metadata = {
  title: "جامعة برج العرب التكنولوجية | نظام تسجيل بصمة الوجه وإدارة الطوابير",
  description:
    "المنصة الرسمية لحجز مواعيد تسجيل بصمة الوجه وإدارة طوابير الانتظار لطلاب الفرقة الثانية بقسم تكنولوجيا المعلومات - جامعة برج العرب التكنولوجية (BATU)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-slate-950 text-slate-100 font-arabic antialiased selection:bg-blue-600 selection:text-white">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
