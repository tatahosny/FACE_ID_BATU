"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MapPin,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Building,
  GraduationCap,
  Layers,
  ArrowRight,
  Ticket,
  UserPlus,
  Send,
  Sparkles,
} from "lucide-react";

export default function PublicSchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedGroup, setSelectedGroup] = useState("ALL");
  const [selectedSubSection, setSelectedSubSection] = useState<"ALL" | "A" | "B">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Fetch Schedules
    const fetchSchedules = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/schedules");
        const json = await res.json();
        if (json.success && json.data.schedules) {
          setSchedules(json.data.schedules);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();

    // Fetch Groups
    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => j.success && setGroups(j.data.groups || []));

    // Fetch Sections
    fetch("/api/sections")
      .then((r) => r.json())
      .then((j) => j.success && setSections(j.data.sections || []));
  }, []);

  // Filtered schedules
  const filtered = schedules.filter((sc) => {
    if (selectedGroup !== "ALL" && sc.groupId !== selectedGroup) return false;
    if (selectedSubSection !== "ALL" && sc.subSection !== "ALL" && sc.subSection !== selectedSubSection)
      return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = sc.sectionName?.toLowerCase().includes(q);
      const matchCode = sc.sectionCode?.toLowerCase().includes(q);
      const matchGroup = sc.groupName?.toLowerCase().includes(q);
      const matchVenue = sc.notes?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchGroup && !matchVenue) return false;
    }
    return true;
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-blue-600 selection:text-white print:bg-white print:text-black print:p-0">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation & Breadcrumb (Hidden in Print) */}
        <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition flex items-center gap-1.5 text-xs font-bold"
            >
              <ArrowRight className="w-4 h-4" />
              <span>الرئيسية</span>
            </Link>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>/</span>
              <span className="text-blue-400 font-bold">جدول مواعيد تسجيل بصمة الوجه</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>تصدير وطباعة جدول PDF</span>
            </button>
          </div>
        </div>

        {/* Hero Banner Header (Hidden in Print) */}
        <div className="print:hidden relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950/80 border border-slate-800/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
          <div className="absolute top-0 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-mono font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>الجدول الرسمي المعتمد • جامعة برج العرب التكنولوجية (BATU)</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-snug">
                جدول مواعيد تسجيل بصمة الوجه المعتمد
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                مواعيد حضور سكاشن الفرقة الثانية (قسم تكنولوجيا المعلومات) لتسجيل بصمة الوجه المعتمدة،
                مقسمة بدقة حسب المجموعات والسكاشن وتقسيمتي <b className="text-blue-400">قسم A</b> و{" "}
                <b className="text-purple-400">قسم B</b> لتنظيم الحضور ومنع التكدس.
              </p>
            </div>

            {/* Quick Links Card */}
            <div className="bg-[#0b101d] p-4 rounded-2xl border border-slate-800/80 space-y-2.5 sm:min-w-[240px]">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                روابط سريعة للمنظومة:
              </div>
              <Link
                href="/register"
                className="w-full py-2 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold transition flex items-center justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" />
                  تسجيل البيانات أولاً
                </span>
                <span>←</span>
              </Link>
              <Link
                href="/booking"
                className="w-full py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition flex items-center justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5" />
                  حجز رقم دور بالطابور
                </span>
                <span>←</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar (Hidden in Print) */}
        <div className="print:hidden bg-slate-900/80 rounded-2xl border border-slate-800/80 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 right-3.5" />
              <input
                type="text"
                placeholder="ابحث برقم السكشن، اسم المجموعة، أو المقر..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Filter by Group */}
            <div className="flex items-center gap-2">
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">جميع المجموعات الأكاديمية</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sub-Section Filter Chips (A / B / All) */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-400">تصفية حسب القسم الفرعي:</span>
              <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedSubSection("ALL")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    selectedSubSection === "ALL"
                      ? "bg-slate-800 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSubSection("A")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                    selectedSubSection === "A"
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-300" />
                  <span>قسم A فقط</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSubSection("B")}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                    selectedSubSection === "B"
                      ? "bg-purple-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-300" />
                  <span>قسم B فقط</span>
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              المواعيد المتاحة: <span className="text-white font-bold">{filtered.length}</span> من أصل{" "}
              {schedules.length}
            </div>
          </div>
        </div>

        {/* Printable Official Document Container */}
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-10 backdrop-blur-xl text-white print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
          {/* Printable Official University Header */}
          <div className="hidden print:flex flex-row justify-between items-center border-b-2 border-slate-900 pb-6 mb-8 text-right">
            <div>
              <h2 className="text-lg font-black text-slate-900">جمهورية مصر العربية</h2>
              <h3 className="text-base font-bold text-slate-800">وزارة التعليم العالي والبحث العلمي</h3>
              <h3 className="text-base font-extrabold text-blue-900">
                جامعة برج العرب التكنولوجية (BATU)
              </h3>
              <p className="text-xs text-slate-600 font-semibold">
                كلية تكنولوجيا الصناعة والطاقة • قسم تكنولوجيا المعلومات
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-900 text-amber-400 font-black text-2xl flex items-center justify-center mx-auto mb-1 border-2 border-amber-400">
                BATU
              </div>
              <span className="text-[10px] font-bold text-slate-500">العام الجامعي 2026 / 2027</span>
            </div>

            <div className="text-left font-mono text-xs text-slate-700">
              <div>التاريخ: {new Date().toLocaleDateString("ar-EG")}</div>
              <div>نظام إدارة طوابير البصمة</div>
              <div className="font-bold text-emerald-700 flex items-center gap-1 justify-end">
                <span>معتمد رسمياً</span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Schedule Title */}
          <div className="text-center mb-6">
            <h2 className="text-xl sm:text-2xl font-black text-white print:text-slate-900">
              الجدول الرسمي المعتمد لتسجيل بصمة الوجه (الفرقة الثانية)
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 print:text-slate-500 mt-1">
              قسم تكنولوجيا المعلومات — يرجى الالتزام التام بالمواعيد والمقرات المحددة لكل سكشن وقسم (A / B)
            </p>
          </div>

          {/* Schedule Table */}
          {loading ? (
            <div className="p-16 text-center text-slate-400 text-sm space-y-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>جاري تحميل جدول المواعيد الرسمي...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm space-y-2">
              <AlertCircle className="w-8 h-8 mx-auto text-amber-400 opacity-60" />
              <p>لا توجد مواعيد تطابق شروط البحث الحالية.</p>
              <button
                onClick={() => {
                  setSelectedGroup("ALL");
                  setSelectedSubSection("ALL");
                  setSearchQuery("");
                }}
                className="text-xs text-blue-400 hover:underline font-bold"
              >
                إعادة ضبط خيارات التصفية
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-[#0b101d] border-b border-slate-800 text-slate-400 text-xs font-black print:bg-slate-100 print:text-slate-800 print:border-b-2 print:border-slate-300">
                    <th className="p-3.5">المجموعة</th>
                    <th className="p-3.5">السكشن</th>
                    <th className="p-3.5">القسم المستهدف (A / B)</th>
                    <th className="p-3.5">اليوم والتاريخ</th>
                    <th className="p-3.5">فترة الحضور</th>
                    <th className="p-3.5">المقر والمكان بالتفصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs sm:text-sm">
                  {filtered.map((sc) => (
                    <tr
                      key={sc.id}
                      className="hover:bg-slate-800/40 border-b border-slate-800/60 transition print:bg-white print:border-slate-200"
                    >
                      <td className="p-3.5 font-bold text-white print:text-slate-900">{sc.groupName}</td>
                      <td className="p-3.5 font-extrabold text-blue-400 font-mono print:text-blue-700">
                        {sc.sectionName} ({sc.sectionCode})
                      </td>
                      <td className="p-3.5">
                        {sc.subSection === "A" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-500/10 text-blue-400 border border-blue-500/30 print:bg-blue-50 print:text-blue-900 print:border-blue-400">
                            قسم A فقط
                          </span>
                        ) : sc.subSection === "B" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-purple-500/10 text-purple-400 border border-purple-500/30 print:bg-purple-50 print:text-purple-900 print:border-purple-400">
                            قسم B فقط
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 print:bg-emerald-50 print:text-emerald-900 print:border-emerald-400">
                            A و B معاً (الكامل)
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-bold text-slate-200 print:text-slate-800 flex items-center gap-1.5 pt-4">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{sc.date}</span>
                      </td>
                      <td className="p-3.5 font-mono text-slate-200 font-semibold print:text-slate-900">
                        من {sc.startTime} إلى {sc.endTime}
                      </td>
                      <td className="p-3.5 text-xs text-slate-300 font-medium leading-relaxed max-w-sm print:text-slate-800">
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                          <span>{sc.notes || "معمل الحاسب الآلي الرئيسي (الدور الأرضي)"}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Printable Official Footer / Signatures */}
          <div className="hidden print:flex flex-row justify-between items-center border-t-2 border-slate-300 pt-8 mt-12 text-xs font-bold text-slate-800">
            <div className="text-center">
              <div>منسق قسم تكنولوجيا المعلومات</div>
              <div className="h-12"></div>
              <div>.................................</div>
            </div>

            <div className="text-center">
              <div>عميد كلية تكنولوجيا الصناعة والطاقة</div>
              <div className="h-12"></div>
              <div>.................................</div>
            </div>

            <div className="text-center">
              <div>ختم شؤون الطلاب والكلية</div>
              <div className="h-12 w-28 border-2 border-dashed border-slate-400 rounded-xl mx-auto my-1 flex items-center justify-center text-[10px] text-slate-400">
                خاتم شعار الجمهورية
              </div>
            </div>
          </div>
        </div>

        {/* Important Guidelines Notice Card (Hidden in Print) */}
        <div className="print:hidden p-6 rounded-3xl bg-[#0b101d] border border-slate-800/80 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-white text-base">تعليمات وإرشادات الحضور الرسمية</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                إثبات الهوية الشخصية
              </div>
              <p className="text-slate-400 leading-relaxed">
                يجب إحضار أصل بطاقة الرقم القومي أو الكارنيه الجامعي للتحقق من هوية الطالب قبل أخذ البصمة.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-400" />
                الالتزام بالقسم (A أو B)
              </div>
              <p className="text-slate-400 leading-relaxed">
                يرجى الالتزام التام بالموعد المخصص لقسمك (A أو B)، حيث لن يتم فتح الحجز في غير موعد سكشنك وقسمك.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-purple-400" />
                إشعارات بوت التيليجرام
              </div>
              <p className="text-slate-400 leading-relaxed">
                تأكد من ربط حساب التيليجرام لاستقبال إشعار فتح باب الحجز المباشر ورقم دورك وتأكيد التفعيل فوراً.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
