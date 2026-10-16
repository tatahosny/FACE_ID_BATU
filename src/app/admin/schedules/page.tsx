"use client";

import { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Plus,
  Printer,
  Trash2,
  Building2,
  CheckCircle2,
  AlertTriangle,
  X,
  FileSpreadsheet,
} from "lucide-react";

export default function AdminSchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [formGroupId, setFormGroupId] = useState("");
  const [formSectionId, setFormSectionId] = useState("");
  const [formSubSection, setFormSubSection] = useState<"ALL" | "A" | "B">("ALL");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("13:00");
  const [formVenue, setFormVenue] = useState(
    "معمل الحاسب الآلي الرئيسي — الطابق الأرضي — شباك تسجيل البصمة"
  );
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Filters State
  const [filterGroupId, setFilterGroupId] = useState("ALL");
  const [filterSectionId, setFilterSectionId] = useState("ALL");
  const [filterSubSection, setFilterSubSection] = useState<"ALL" | "A" | "B">("ALL");

  const venuePresets = [
    "معمل الحاسب الآلي الرئيسي — الطابق الأرضي — شباك تسجيل البصمة",
    "مبنى كلية تكنولوجيا الصناعة والطاقة — قاعة السكاشن 104",
    "المدرج المركزي للكلية — شباك الفحص البيومتري",
    "مكتب شؤون الطلاب وقيد الفرق الدراسية — الطابق الأول",
  ];

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

  useEffect(() => {
    fetchSchedules();

    // Fetch groups
    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => j.success && setGroups(j.data.groups || []));
  }, []);

  // Fetch sections when group changes
  useEffect(() => {
    if (!formGroupId) {
      setSections([]);
      setFormSectionId("");
      return;
    }
    fetch(`/api/sections?groupId=${formGroupId}`)
      .then((r) => r.json())
      .then((j) => j.success && setSections(j.data.sections || []));
  }, [formGroupId]);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: formSectionId,
          subSection: formSubSection,
          date: formDate,
          startTime: formStartTime,
          endTime: formEndTime,
          notes: formVenue.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل حفظ الموعد", type: "error" });
        return;
      }

      setFeedback({ message: "تمت إضافة الموعد ومقر البصمة إلى الجدول الرسمي بنجاح!", type: "success" });
      setShowModal(false);
      setFormSectionId("");
      setFormSubSection("ALL");
      setFormDate("");
      await fetchSchedules();
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الموعد من الجدول؟")) return;

    try {
      const res = await fetch(`/api/schedules?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setFeedback({ message: "تم حذف الموعد بنجاح", type: "success" });
        await fetchSchedules();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Non-Printable Header */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">
              ACADEMIC TIMETABLE • إدارة الجداول والاعتماد
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            جدول مواعيد تسجيل بصمة الوجه المعتمد
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            تحديد مواعيد الحضور للسكاشن ومقرات انعقاد لجان البصمة، وتصدير جدول معتمد بصيغة PDF للطباعة والنشر الرسمي.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة موعد ومكان لسكشن</span>
          </button>

          <button
            onClick={handlePrintPDF}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold border border-slate-700 shadow-md transition flex items-center gap-2"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>تصدير وطباعة جدول PDF</span>
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`print:hidden p-4 rounded-2xl border text-sm font-medium flex items-center justify-between animate-fade-in ${
            feedback.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs underline text-slate-400 hover:text-white"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Printable Document Container */}
      <div className="bg-slate-900/90 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-10 backdrop-blur-xl text-white print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
        {/* Printable Official University Header */}
        <div className="hidden print:flex flex-row justify-between items-center border-b-2 border-slate-900 pb-6 mb-8 text-right">
          <div>
            <h2 className="text-lg font-black text-slate-900">جمهورية مصر العربية</h2>
            <h3 className="text-base font-bold text-slate-800">وزارة التعليم العالي والبحث العلمي</h3>
            <h3 className="text-base font-extrabold text-blue-900">جامعة برج العرب التكنولوجية (BATU)</h3>
            <p className="text-xs text-slate-600 font-semibold">كلية تكنولوجيا الصناعة والطاقة • قسم تكنولوجيا المعلومات</p>
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
            قسم تكنولوجيا المعلومات — يرجى الالتزام التام بالمواعيد والمقرات المحددة لكل سكشن
          </p>
        </div>

        {/* Non-Printable Filter Controls */}
        <div className="print:hidden mb-6 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-400">تصفية الجدول:</span>

            {/* Filter by Group */}
            <select
              value={filterGroupId}
              onChange={(e) => {
                setFilterGroupId(e.target.value);
                setFilterSectionId("ALL");
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">جميع المجموعات</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            {/* Filter by SubSection A / B */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setFilterSubSection("ALL")}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filterSubSection === "ALL"
                    ? "bg-slate-700 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                الكل
              </button>
              <button
                type="button"
                onClick={() => setFilterSubSection("A")}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filterSubSection === "A"
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                قسم A
              </button>
              <button
                type="button"
                onClick={() => setFilterSubSection("B")}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filterSubSection === "B"
                    ? "bg-purple-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                قسم B
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            المواعيد المعروضة:{" "}
            <span className="text-white font-bold">
              {
                schedules.filter((sc) => {
                  if (filterGroupId !== "ALL" && sc.groupId !== filterGroupId) return false;
                  if (filterSubSection !== "ALL" && sc.subSection !== "ALL" && sc.subSection !== filterSubSection)
                    return false;
                  return true;
                }).length
              }
            </span>{" "}
            من أصل {schedules.length}
          </div>
        </div>

        {/* Schedule Table */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm space-y-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>جاري تحميل مواعيد السكاشن...</p>
          </div>
        ) : schedules.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            لا توجد مواعيد مضافة في الجدول حتى الآن. اضغط على «إضافة موعد ومكان لسكشن» للبدء.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-[#0b101d] border-b border-slate-800 text-slate-400 text-xs font-black print:bg-slate-100 print:text-slate-800 print:border-b-2 print:border-slate-300">
                  <th className="p-3.5">المجموعة</th>
                  <th className="p-3.5">السكشن</th>
                  <th className="p-3.5">القسم (A / B)</th>
                  <th className="p-3.5">اليوم والتاريخ</th>
                  <th className="p-3.5">فترة الحضور</th>
                  <th className="p-3.5">المقر والمكان بالتفصيل</th>
                  <th className="p-3.5 print:hidden text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs sm:text-sm">
                {schedules
                  .filter((sc) => {
                    if (filterGroupId !== "ALL" && sc.groupId !== filterGroupId) return false;
                    if (filterSubSection !== "ALL" && sc.subSection !== "ALL" && sc.subSection !== filterSubSection)
                      return false;
                    return true;
                  })
                  .map((sc) => (
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
                      <td className="p-3.5 print:hidden text-center">
                        <button
                          onClick={() => handleDeleteSchedule(sc.id)}
                          className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs font-bold transition border border-red-500/30 inline-flex items-center gap-1"
                          title="حذف الموعد"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Printable Footer / Endorsement */}
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

      {/* Add Schedule Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 animate-scale-up shadow-2xl border border-slate-800 text-white">
            <div className="flex justify-between items-center pb-3 border-b border-slate-800">
              <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                <span>إضافة موعد وتحديد المقر لسكشن</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-4">
              {/* Group */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">المجموعة:</label>
                <select
                  required
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" className="bg-slate-900 text-slate-400">-- اختر المجموعة الأكاديمية --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">السكشن:</label>
                <select
                  required
                  value={formSectionId}
                  onChange={(e) => setFormSectionId(e.target.value)}
                  disabled={!formGroupId || sections.length === 0}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-900 disabled:text-slate-500 disabled:border-slate-800"
                >
                  <option value="" className="bg-slate-900 text-slate-400">-- اختر السكشن الأكاديمي --</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sub-Section Selector (A / B / ALL) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  القسم المستهدف (تقسيم A و B للسكشن):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormSubSection("ALL")}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition text-center ${
                      formSubSection === "ALL"
                        ? "bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30"
                        : "bg-slate-950 text-slate-400 border-slate-700 hover:text-white"
                    }`}
                  >
                    A و B معاً (الكل)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormSubSection("A")}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition text-center ${
                      formSubSection === "A"
                        ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30"
                        : "bg-slate-950 text-slate-400 border-slate-700 hover:text-white"
                    }`}
                  >
                    قسم A فقط
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormSubSection("B")}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition text-center ${
                      formSubSection === "B"
                        ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30"
                        : "bg-slate-950 text-slate-400 border-slate-700 hover:text-white"
                    }`}
                  >
                    قسم B فقط
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  تحديد الموعد لطلاب قسم A أو قسم B أو السكشن بالكامل (تفعيل مطابق لفترات الحجز).
                </p>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ الموعد:</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">وقت البدء:</label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">وقت الانتهاء:</label>
                  <input
                    type="time"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Venue & Notes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-300">
                    كتابة المقر والمكان بالتفصيل:
                  </label>
                  <span className="text-[11px] text-blue-400 font-semibold flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    يظهر في جدول PDF وتنبيهات البوت
                  </span>
                </div>
                <textarea
                  rows={2}
                  required
                  value={formVenue}
                  onChange={(e) => setFormVenue(e.target.value)}
                  placeholder="مثال: مبنى كلية تكنولوجيا الصناعة والطاقة — معمل الحاسب الآلي (الطابق الأرضي)"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {/* Quick Presets */}
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] text-slate-400 font-semibold">مقرات مقترحة سريعة:</div>
                  <div className="flex flex-wrap gap-1">
                    {venuePresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setFormVenue(preset)}
                        className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                      >
                        {preset.split("—")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:bg-blue-900 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition flex items-center justify-center gap-2"
                >
                  {submitting ? "جاري الحفظ..." : "حفظ الموعد بالجدول"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
