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
  Users,
} from "lucide-react";
import { getArabicDayName, format12HourTime, getAcademicTimeMinutes } from "@/lib/utils/datetime";
import { FREE_SLOT_PERIODS } from "@/lib/constants/academic";

function normalizeDayName(d?: string | null): string {
  if (!d) return "";
  return d
    .trim()
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

export default function PublicSchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [freeSlots, setFreeSlots] = useState<any[]>([]);
  const [freeDays, setFreeDays] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFreeSlots, setLoadingFreeSlots] = useState(true);

  // Active Tab - Default is Free Slots as primary printable schedule
  const [activeTab, setActiveTab] = useState<"BIOMETRICS" | "FREE_SLOTS">("FREE_SLOTS");

  // Filters
  const [selectedAcademicYear, setSelectedAcademicYear] = useState("ALL");
  const [selectedSpecialization, setSelectedSpecialization] = useState("ALL");
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

    // Fetch Free Slots & Days for 3rd year
    setLoadingFreeSlots(true);
    fetch("/api/free-slots")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data) {
          setFreeDays(j.data.days || []);
          setFreeSlots(j.data.slots || []);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingFreeSlots(false));

    // Fetch Groups
    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => j.success && setGroups(j.data.groups || []));

    // Fetch Sections
    fetch("/api/sections")
      .then((r) => r.json())
      .then((j) => j.success && setSections(j.data.sections || []));
  }, []);

  // Filtered & Chronologically Sorted schedules (Morning first, 10:20 before 01:00)
  const filtered = schedules
    .filter((sc) => {
      if (selectedAcademicYear !== "ALL" && sc.academicYear !== selectedAcademicYear) return false;
      if (selectedSpecialization !== "ALL" && sc.specialization !== selectedSpecialization) return false;
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
    })
    .sort((a, b) => {
      // 1. Sort by Date first
      if (a.date !== b.date) {
        return (a.date || "").localeCompare(b.date || "");
      }
      // 2. Sort by Morning-First Academic Minutes (e.g. 10:20 AM comes BEFORE 01:00 PM)
      const aMinutes = getAcademicTimeMinutes(a.startTime);
      const bMinutes = getAcademicTimeMinutes(b.startTime);
      return aMinutes - bMinutes;
    });

  // Day Order Map for Chronological Sorting
  const DAY_ORDER: Record<string, number> = {
    "السبت": 1,
    "الأحد": 2,
    "الإثنين": 3,
    "الاثنين": 3,
    "الثلاثاء": 4,
    "الأربعاء": 5,
    "الاربعاء": 5,
    "الخميس": 6,
    "الجمعة": 7,
  };

  // Filtered & Chronologically Sorted Free Slots (Saturday -> Thursday, Period 1 -> 9)
  const filteredFreeSlots = freeSlots
    .filter((fs) => {
      if (selectedSpecialization !== "ALL" && fs.specialization !== selectedSpecialization) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const normQ = normalizeDayName(q);
        const matchSection = fs.sectionName?.toLowerCase().includes(q);
        const matchGroup = fs.groupName?.toLowerCase().includes(q);
        const matchDelegate = fs.delegateName?.toLowerCase().includes(q);
        const matchDay = normalizeDayName(fs.dayName).includes(normQ);
        if (!matchSection && !matchGroup && !matchDelegate && !matchDay) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dayA = DAY_ORDER[a.dayName] || 99;
      const dayB = DAY_ORDER[b.dayName] || 99;
      if (dayA !== dayB) return dayA - dayB;
      return (Number(a.periodIndex) || 0) - (Number(b.periodIndex) || 0);
    });

  // Calculate unique sorted days to display in horizontal grid
  const displayDays = (() => {
    const defaultList = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
    const allCandidates = [
      ...defaultList,
      ...freeDays.map((d) => d.dayName),
      ...freeSlots.map((s) => s.dayName),
    ].filter(Boolean);

    const seen = new Set<string>();
    const result: string[] = [];
    for (const name of allCandidates) {
      const norm = normalizeDayName(name);
      if (!seen.has(norm)) {
        seen.add(norm);
        result.push(name);
      }
    }
    return result.sort((a, b) => (DAY_ORDER[a] || 99) - (DAY_ORDER[b] || 99));
  })();

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
              <span>
                {activeTab === "FREE_SLOTS"
                  ? "تصدير وطباعة جدول فترات الفراغ PDF"
                  : "تصدير وطباعة جدول البصمة اليدوي PDF"}
              </span>
            </button>
          </div>
        </div>

        {/* Hero Banner Header (Hidden in Print) */}
        <div className="print:hidden relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950/80 border border-slate-800/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
          <div className="absolute top-0 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white p-2 shadow-xl shadow-blue-500/20 border border-slate-700/60 flex-shrink-0 flex items-center justify-center">
                <img
                  src="/images/batu-logo.png"
                  alt="جامعة برج العرب التكنولوجية"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-mono font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="px-1.5 py-0.2 rounded bg-blue-500/20 font-bold text-[10px]">v3.1</span>
                  <span>الجدول الرسمي المعتمد • جامعة برج العرب التكنولوجية (BATU)</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                  جدول مواعيد تسجيل بصمة الوجه المعتمد
                </h1>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
                  مواعيد حضور سكاشن الفرقة الثانية (قسم تكنولوجيا المعلومات) لتسجيل بصمة الوجه المعتمدة،
                  مقسمة بدقة حسب المجموعات والسكاشن وتقسيمتي <b className="text-blue-400">قسم A</b> و{" "}
                  <b className="text-purple-400">قسم B</b> لتنظيم الحضور ومنع التكدس مع ميزة التصدير والطباعة الرسمية الفورية.
                </p>
              </div>
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

        {/* View Switcher Tabs (Hidden in Print) */}
        <div className="print:hidden flex items-center gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab("FREE_SLOTS")}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center justify-center gap-2 ${
              activeTab === "FREE_SLOTS"
                ? "bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg shadow-cyan-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-300" />
            <span>جدول فترات فراغ سكاشن الفرقة الثالثة (المعتمد بواسطة المناديب)</span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 text-[10px] font-bold border border-cyan-500/30">
              الأساسي للطباعة
            </span>
          </button>

          <button
            onClick={() => setActiveTab("BIOMETRICS")}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition flex items-center justify-center gap-2 ${
              activeTab === "BIOMETRICS"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>جدول مواعيد تسجيل بصمة الوجه ومقرات اللجان</span>
          </button>
        </div>

        {/* Filter & Search Bar (Hidden in Print) */}
        <div className="print:hidden bg-slate-900/80 rounded-2xl border border-slate-800/80 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 right-3.5" />
              <input
                type="text"
                placeholder={
                  activeTab === "BIOMETRICS"
                    ? "ابحث برقم السكشن، اسم المجموعة، أو المقر..."
                    : "ابحث برقم السكشن، اسم المندوب، أو اليوم..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Specialization Filter (Shown for both or free slots) */}
            <div className="flex items-center gap-2">
              <select
                value={selectedSpecialization}
                onChange={(e) => setSelectedSpecialization(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="ALL">جميع الشُعب</option>
                <option value="سوفت وير">💻 شعبة سوفت وير</option>
                <option value="نيتورك">🌐 شعبة نيتورك</option>
              </select>
            </div>

            {activeTab === "BIOMETRICS" && (
              <>
                {/* Academic Year Filter */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedAcademicYear}
                    onChange={(e) => setSelectedAcademicYear(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">جميع الفرق</option>
                    <option value="الفرقة الأولى">الفرقة الأولى</option>
                    <option value="الفرقة الثانية">الفرقة الثانية</option>
                    <option value="الفرقة الثالثة">الفرقة الثالثة</option>
                    <option value="الفرقة الرابعة">الفرقة الرابعة</option>
                  </select>
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
              </>
            )}
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
          {/* Print Styles for Landscape Orientation */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page {
                size: landscape;
                margin: 8mm;
              }
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          `}} />

          {/* Printable Official University Header with Logo */}
          <div className="hidden print:flex flex-col items-center justify-center border-b-2 border-black pb-4 mb-6 text-center">
            <div className="w-24 h-24 mx-auto mb-2 flex items-center justify-center">
              <img
                src="/images/batu-logo.png"
                alt="شعار جامعة برج العرب التكنولوجية"
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <h1 className="text-xl font-black text-black tracking-tight">
              جامعة برج العرب التكنولوجية (BATU)
            </h1>
            <h2 className="text-sm font-bold text-slate-800 mt-0.5">
              كلية تكنولوجيا الصناعة والطاقة • قسم تكنولوجيا المعلومات
            </h2>
            <h3 className="text-base font-extrabold text-blue-900 mt-2 bg-slate-100 px-4 py-1 rounded-lg border border-slate-300 inline-block">
              {activeTab === "FREE_SLOTS"
                ? "الجدول الرسمي المعتمد لفترات فراغ سكاشن الفرقة الثالثة (المعتمد بواسطة المناديب)"
                : "الجدول الرسمي المعتمد لتسجيل بصمة الوجه ومقرات اللجان"}
            </h3>
            <div className="flex items-center justify-center gap-4 text-xs font-bold text-slate-700 mt-2">
              <span>العام الجامعي: 2026 / 2027</span>
              <span>•</span>
              <span>تاريخ الطباعة: {new Date().toLocaleDateString("ar-EG")}</span>
              <span>•</span>
              <span className="text-emerald-800 font-bold">معتمد رسمياً للنشر</span>
            </div>
          </div>

          {/* Schedule Title for Screen (Hidden in Print) */}
          <div className="print:hidden text-center mb-6 space-y-1">
            <h2 className="text-xl sm:text-2xl font-black text-white">
              {activeTab === "BIOMETRICS"
                ? "الجدول الرسمي المعتمد لتسجيل بصمة الوجه"
                : "جدول مواعيد فترات فراغ سكاشن الفرقة الثالثة (المعتمد بواسطة المناديب)"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              {activeTab === "BIOMETRICS"
                ? "قسم تكنولوجيا المعلومات — يرجى الالتزام التام بالمواعيد والمقرات المحددة لكل سكشن وقسم (A / B)"
                : "الفترات الزمنية المعتمدة رسمياً لكل سكشن بالفرقة الثالثة وفق اختيار المناديب"}
            </p>

            {activeTab === "FREE_SLOTS" ? (
              <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-cyan-600/30 transition transform hover:-translate-y-0.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة جدول فترات الفراغ PDF (بالعرض)</span>
                </button>
              </div>
            ) : (
              <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-blue-600/30 transition transform hover:-translate-y-0.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة جدول مواعيد البصمة اليدوي PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* Conditional Table View: Biometrics vs Free Slots */}
          {activeTab === "FREE_SLOTS" ? (
            loadingFreeSlots ? (
              <div className="p-16 text-center text-slate-400 text-sm space-y-3">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>جاري تحميل جدول فترات الفراغ الرسمي...</p>
              </div>
            ) : (
              /* Horizontal Grid View (Days as rows on the right, Periods 1-9 across columns) */
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-right border-collapse border border-slate-800 print:border-2 print:border-black text-xs sm:text-sm min-w-[1000px] print:min-w-0">
                  <thead>
                    <tr className="bg-[#0b101d] border-b border-slate-800 text-slate-300 text-xs font-black print:bg-slate-100 print:text-black print:border-b-2 print:border-black">
                      <th className="p-3 w-28 text-center border-l border-slate-800 bg-[#070b14] print:bg-slate-100 print:border print:border-black print:text-black">
                        اليوم / الفترة
                      </th>
                      {FREE_SLOT_PERIODS.map((period) => (
                        <th
                          key={period.index}
                          className="p-2 text-center border-l border-slate-800 bg-slate-900/70 print:bg-slate-100 print:border print:border-black print:text-black"
                        >
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <span className="text-xs font-extrabold text-white print:text-black">{period.name}</span>
                            <span className="text-[10px] text-cyan-400 font-mono print:text-slate-800">
                              {period.startTime} - {period.endTime}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs print:divide-black">
                    {displayDays.map((dayName) => (
                      <tr
                        key={dayName}
                        className="hover:bg-purple-950/10 transition print:bg-white print:border print:border-black"
                      >
                        {/* Day Row Header (Rightmost Column) */}
                        <td className="p-3 text-center border-l border-slate-800 print:border print:border-black font-black bg-[#070b14] print:bg-slate-50 text-white print:text-black">
                          <div className="text-sm font-black">{dayName}</div>
                        </td>

                        {/* 9 Period Columns for this Day */}
                        {FREE_SLOT_PERIODS.map((period) => {
                          const cellSlots = filteredFreeSlots.filter(
                            (fs) =>
                              normalizeDayName(fs.dayName) === normalizeDayName(dayName) &&
                              Number(fs.periodIndex) === Number(period.index)
                          );

                          return (
                            <td
                              key={`${dayName}-${period.index}`}
                              className="p-1.5 border-l border-slate-800 print:border print:border-black align-top min-w-[105px] h-24 print:h-auto"
                            >
                              {cellSlots.length > 0 ? (
                                <div className="space-y-1.5">
                                  {cellSlots.map((fs) => (
                                    <div
                                      key={fs.id}
                                      className={`p-2 rounded-xl border flex flex-col justify-between text-right space-y-1 transition print:bg-white print:border print:border-black ${
                                        fs.specialization === "سوفت وير"
                                          ? "bg-cyan-950/50 border-cyan-500/40 text-cyan-200"
                                          : "bg-purple-950/50 border-purple-500/40 text-purple-200"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span
                                          className={`text-[9px] font-black px-1.5 py-0.5 rounded-full print:border print:border-black print:text-black print:bg-transparent ${
                                            fs.specialization === "سوفت وير"
                                              ? "bg-cyan-500/20 text-cyan-300"
                                              : "bg-purple-500/20 text-purple-300"
                                          }`}
                                        >
                                          {fs.specialization}
                                        </span>
                                        <span className="text-[10px] font-extrabold text-white print:text-black truncate">
                                          {fs.sectionName}
                                        </span>
                                      </div>

                                      <div
                                        className="text-[10px] text-slate-300 print:text-slate-800 truncate"
                                        title={fs.groupName}
                                      >
                                        {fs.groupName}
                                      </div>

                                      <div
                                        className="text-[9px] font-semibold text-emerald-300 print:text-slate-800 truncate"
                                        title={fs.delegateName}
                                      >
                                        👤 {fs.delegateName || "مندوب السكشن"}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="h-full min-h-[60px] flex items-center justify-center text-slate-600 text-[11px] font-medium border border-dashed border-slate-800/60 rounded-xl print:border-none print:text-slate-400">
                                  —
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* Biometrics Table */
            loading ? (
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
                    setSelectedAcademicYear("ALL");
                    setSelectedSpecialization("ALL");
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
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-right border-collapse border border-slate-700 print:border-2 print:border-black text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-[#0b101d] border-b border-slate-800 text-slate-300 text-xs font-black print:bg-slate-100 print:text-black print:border-b-2 print:border-black">
                      <th className="p-3 border border-slate-800 print:border print:border-black text-center w-10">
                        م
                      </th>
                      <th className="p-3 border border-slate-800 print:border print:border-black">المجموعة</th>
                      <th className="p-3 border border-slate-800 print:border print:border-black">السكشن</th>
                      <th className="p-3 border border-slate-800 print:border print:border-black text-center">
                        القسم (A / B)
                      </th>
                      <th className="p-3 border border-slate-800 print:border print:border-black text-center">
                        اليوم والتاريخ
                      </th>
                      <th className="p-3 border border-slate-800 print:border print:border-black text-center">
                        فترة الحضور
                      </th>
                      <th className="p-3 border border-slate-800 print:border print:border-black">
                        المقر وقاعة البصمة بالتفصيل
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-xs sm:text-sm">
                    {filtered.map((sc, idx) => (
                      <tr
                        key={sc.id}
                        className="hover:bg-slate-800/40 border-b border-slate-800/60 transition print:bg-white print:border print:border-black print:text-black"
                      >
                        <td className="p-3 border border-slate-800/80 print:border print:border-black text-center font-bold font-mono print:text-black">
                          {idx + 1}
                        </td>
                        <td className="p-3 border border-slate-800/80 print:border print:border-black font-bold text-white print:text-black">
                          {sc.groupName}
                        </td>
                        <td className="p-3 border border-slate-800/80 print:border print:border-black font-black text-blue-400 font-mono print:text-black">
                          {sc.sectionName} ({sc.sectionCode})
                        </td>
                        <td className="p-3 border border-slate-800/80 print:border print:border-black text-center">
                          {sc.subSection === "A" ? (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-blue-500/10 text-blue-400 border border-blue-500/30 print:border print:border-blue-900 print:bg-blue-50 print:text-blue-950 font-bold">
                              قسم A فقط
                            </span>
                          ) : sc.subSection === "B" ? (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-purple-500/10 text-purple-400 border border-purple-500/30 print:border print:border-purple-900 print:bg-purple-50 print:text-purple-950 font-bold">
                              قسم B فقط
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 print:border print:border-emerald-900 print:bg-emerald-50 print:text-emerald-950 font-bold">
                              A و B معاً (الكامل)
                            </span>
                          )}
                        </td>
                        <td className="p-3 border border-slate-800/80 print:border print:border-black text-center">
                          <div className="inline-flex flex-col items-center justify-center">
                            <span className="font-black text-amber-400 print:text-black text-sm">
                              {getArabicDayName(sc.date) || "—"}
                            </span>
                            <span className="text-[11px] font-mono text-slate-300 print:text-slate-800 mt-0.5" dir="ltr">
                              {sc.date}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 border border-slate-800/80 print:border print:border-black text-center font-bold text-slate-200 print:text-black">
                          <span className="inline-flex items-center gap-1 font-mono text-xs sm:text-sm">
                            <span>من {format12HourTime(sc.startTime)}</span>
                            <span className="text-slate-500 print:text-black">إلى</span>
                            <span>{format12HourTime(sc.endTime)}</span>
                          </span>
                        </td>
                        <td className="p-3 border border-slate-800/80 print:border print:border-black text-xs text-slate-300 font-medium print:text-black">
                          {sc.notes || "مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
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
