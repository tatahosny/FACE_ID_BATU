"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import {
  Clock,
  Play,
  Pause,
  XCircle,
  Plus,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  X,
  Calendar,
  Layers,
  RotateCcw,
  CheckSquare,
  Square,
  Sparkles,
  MapPin,
} from "lucide-react";

export default function AdminBookingWindowsPage() {
  const [windows, setWindows] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Form State
  const [formGroupId, setFormGroupId] = useState("");
  const [formSectionId, setFormSectionId] = useState("");
  const [formSubSection, setFormSubSection] = useState<"ALL" | "A" | "B">("ALL");
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formCapacity, setFormCapacity] = useState(50);
  const [formStatus, setFormStatus] = useState("OPEN");
  const [submitting, setSubmitting] = useState(false);

  const fetchWindows = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/booking-windows");
      const json = await res.json();
      if (json.success && json.data.windows) {
        setWindows(json.data.windows);
        const subMap: Record<string, "ALL" | "A" | "B"> = {};
        json.data.windows.forEach((w: any) => {
          subMap[w.id] = (w.subSection as "ALL" | "A" | "B") || "ALL";
        });
        setTargetSubSections((prev) => ({ ...subMap, ...prev }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWindows();

    // Fetch groups
    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => j.success && setGroups(j.data.groups));
  }, []);

  // Fetch sections when group changes in create form
  useEffect(() => {
    if (!formGroupId) {
      setSections([]);
      setFormSectionId("");
      return;
    }
    fetch(`/api/sections?groupId=${formGroupId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data.sections) {
          setSections(j.data.sections);
          if (j.data.sections.length > 0) {
            setFormSectionId(j.data.sections[0].id);
          }
        }
      });
  }, [formGroupId]);

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === windows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(windows.map((w) => w.id));
    }
  };

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [targetSubSections, setTargetSubSections] = useState<Record<string, "ALL" | "A" | "B">>({});

  // Status change per single window with specific subSection selection
  const handleStatusChange = async (
    windowId: string,
    newStatus: string,
    subSection?: "ALL" | "A" | "B"
  ) => {
    try {
      setActionLoading(windowId);
      const chosenSubSection = subSection || targetSubSections[windowId] || "ALL";

      const res = await fetch(`/api/booking-windows/${windowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          subSection: chosenSubSection,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({
          text: json.message || "تم تحديث فترة وضوابط الحجز بنجاح",
          type: "success",
        });
        fetchWindows();
      } else {
        setMessage({ text: json.error || "فشل التحديث", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Bulk Operations Handler (Open, Pause, Close)
  const handleBulkAction = async (action: "OPEN" | "PAUSED" | "CLOSED") => {
    if (selectedIds.length === 0) return;

    const actionName =
      action === "OPEN"
        ? "فتح الحجز وإشعار الطلاب"
        : action === "PAUSED"
        ? "الإيقاف المؤقت"
        : "الإغلاق";
    if (
      !confirm(
        `هل أنت متأكد من تنفيذ عملية (${actionName}) لـ ${selectedIds.length} فترة حجز محددة؟`
      )
    ) {
      return;
    }

    try {
      setBulkActionLoading(true);
      setMessage(null);

      const res = await fetch("/api/booking-windows/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          windowIds: selectedIds,
          action,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setMessage({ text: json.message || "تم تنفيذ العملية المجمعة بنجاح", type: "success" });
        setSelectedIds([]);
        fetchWindows();
      } else {
        setMessage({ text: json.error || "فشل تنفيذ العملية المجمعة", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setMessage(null);

      const startsAt = formStartsAt ? new Date(formStartsAt).toISOString() : new Date().toISOString();
      const endsAt = formEndsAt
        ? new Date(formEndsAt).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const res = await fetch("/api/booking-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: formGroupId,
          sectionId: formSectionId,
          subSection: formSubSection,
          startsAt,
          endsAt,
          capacity: formCapacity,
          status: formStatus,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setMessage({ text: "تم إنشاء فترة الحجز بنجاح!", type: "success" });
        setShowCreateModal(false);
        fetchWindows();
      } else {
        setMessage({ text: json.error || "فشل إنشاء الفترة", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const allSelected = windows.length > 0 && selectedIds.length === windows.length;
  const isIndeterminate = selectedIds.length > 0 && selectedIds.length < windows.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">
              BOOKING SLOTS • ضوابط ونوافذ الحجز
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            إدارة فترات وضوابط الحجز لكل سكشن
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            التحكم في مواعيد فتح وإيقاف الحجز لكل سكشن وتحديد القسم المسموح له بالحجز (قسم A أو B أو معاً)، مع إرسال إشعار فوري عبر التيليجرام للطلاب عند الفتح. (تصفير أرقام التذاكر لنهاية اليوم متاح بشاشة الطابور الحي).
          </p>
        </div>
        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2 self-stretch sm:self-auto flex-wrap w-full sm:w-auto">
          <Link
            href="/admin/settings"
            className="py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md text-center"
            title="تحديد وتعديل المقر المعتمد للبصمة المرسل في رسالة التيليجرام للطلاب"
          >
            <MapPin className="w-3.5 h-3.5 text-cyan-400" />
            <span>تحديد مقر البصمة بالرسالة</span>
          </Link>
          <button
            onClick={() => setShowCreateModal(true)}
            className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 text-center"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء فترة حجز جديدة لسكشن</span>
          </button>
        </div>
      </div>

      {/* Feedback Message */}
      {message && (
        <div
          className={`p-4 rounded-2xl border text-sm font-medium flex items-center justify-between animate-fade-in ${
            message.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs underline text-slate-400 hover:text-white">
            إغلاق
          </button>
        </div>
      )}

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="bg-gradient-to-r from-blue-950/80 via-slate-900/90 to-indigo-950/80 border border-blue-500/40 rounded-2xl p-4 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 font-bold text-sm font-mono">
              {selectedIds.length}
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                تم تحديد ({selectedIds.length}) من أصل ({windows.length}) فترة حجز
              </div>
              <div className="text-xs text-blue-300">
                اختر العملية المجمعة لتطبيقها على جميع السكاشن المحددة دفعة واحدة:
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Bulk OPEN */}
            <button
              onClick={() => handleBulkAction("OPEN")}
              disabled={bulkActionLoading}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/30 disabled:opacity-50"
              title="فتح الحجز وإرسال تنبيهات التيليجرام لجميع السكاشن المحددة"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>فتح مجمّع وبث</span>
            </button>

            {/* Bulk PAUSE */}
            <button
              onClick={() => handleBulkAction("PAUSED")}
              disabled={bulkActionLoading}
              className="px-3.5 py-2 rounded-xl bg-amber-600/30 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              title="إيقاف الحجز مؤقتاً وبث تنبيه للطلاب"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>إيقاف مؤقت مجمّع</span>
            </button>

            {/* Bulk CLOSE */}
            <button
              onClick={() => handleBulkAction("CLOSED")}
              disabled={bulkActionLoading}
              className="px-3.5 py-2 rounded-xl bg-red-600/30 hover:bg-red-600/40 text-red-300 border border-red-500/40 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
              title="إغلاق الفترات المحددة نهائياً"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>إغلاق مجمّع</span>
            </button>

            {/* Clear Selection */}
            <button
              onClick={() => setSelectedIds([])}
              disabled={bulkActionLoading}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>إلغاء التحديد</span>
            </button>
          </div>
        </div>
      )}

      {/* Windows Table */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm space-y-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>جاري تحميل فترات الحجز...</p>
          </div>
        ) : windows.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            لا توجد فترات حجز مسجلة. اضغط على «إنشاء فترة حجز جديدة» للبدء.
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right text-sm min-w-[850px]">
              <thead className="bg-[#0b101d] text-slate-400 text-xs font-bold border-b border-slate-800">
                <tr>
                  <th className="py-4 px-4 w-12 text-center">
                    <button
                      onClick={handleSelectAll}
                      className="p-1 rounded text-slate-400 hover:text-white transition"
                      title={allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                    >
                      {allSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-400" />
                      ) : isIndeterminate ? (
                        <div className="w-4 h-4 rounded border-2 border-blue-400 flex items-center justify-center bg-blue-500/20">
                          <div className="w-2 h-0.5 bg-blue-400" />
                        </div>
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-4 px-4">المجموعة / السكشن</th>
                  <th className="py-4 px-4">تحديد القسم المسموح له بالحجز</th>
                  <th className="py-4 px-4">رقم التذكرة القادمة</th>
                  <th className="py-4 px-4">إجمالي المحجوز</th>
                  <th className="py-4 px-4">الحالة</th>
                  <th className="py-4 px-4 text-center">التحكم الفوري وبث التيليجرام</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {windows.map((w) => {
                  const isSelected = selectedIds.includes(w.id);

                  return (
                    <tr
                      key={w.id}
                      className={`transition ${
                        isSelected ? "bg-blue-950/30" : "hover:bg-slate-800/40"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => handleToggleSelect(w.id)}
                          className="p-1 rounded text-slate-400 hover:text-white transition"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Group and Section */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-white text-base">{w.sectionName}</div>
                        <div className="text-xs text-slate-400">{w.groupName}</div>
                      </td>

                      {/* Targeted Sub-Section Selection */}
                      <td className="py-4 px-4">
                        <div className="space-y-1.5">
                          <div className="inline-flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-700/60 shadow-inner">
                            <button
                              type="button"
                              onClick={() =>
                                setTargetSubSections((prev) => ({ ...prev, [w.id]: "A" }))
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                (targetSubSections[w.id] || w.subSection) === "A"
                                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400"
                                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                              }`}
                              title="السماح لطلاب قسم A فقط بالحجز"
                            >
                              <span>قسم A</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setTargetSubSections((prev) => ({ ...prev, [w.id]: "B" }))
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                (targetSubSections[w.id] || w.subSection) === "B"
                                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400"
                                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                              }`}
                              title="السماح لطلاب قسم B فقط بالحجز"
                            >
                              <span>قسم B</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setTargetSubSections((prev) => ({ ...prev, [w.id]: "ALL" }))
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                                (targetSubSections[w.id] || w.subSection) === "ALL"
                                  ? "bg-teal-600 text-white shadow-md shadow-teal-600/30 ring-1 ring-teal-400"
                                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                              }`}
                              title="السماح لقسمي A و B معاً بالحجز"
                            >
                              <span>A + B معاً</span>
                            </button>
                          </div>

                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            <span>المسموح حالياً:</span>
                            <span className="font-bold text-slate-200">
                              {w.subSection === "A"
                                ? "قسم A فقط"
                                : w.subSection === "B"
                                ? "قسم B فقط"
                                : "القسمين معاً (A و B)"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Next Queue Ticket */}
                      <td className="py-4 px-4 font-mono text-xs">
                        <div className="text-slate-300 font-bold">
                          رقم: #{String(w.nextQueueNumber || 1).padStart(3, "0")}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {w.nextQueueNumber > 1 ? "تم إصدار تذاكر" : "يبدأ من أول 1"}
                        </div>
                      </td>

                      {/* Booked Count */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-white font-mono text-sm">
                          {w.bookedCount} طالب
                        </div>
                        <div className="text-[11px] text-emerald-400">
                          طابور مفتوح
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                            w.status === "OPEN"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : w.status === "PAUSED"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                              : w.status === "CLOSED"
                              ? "bg-red-500/10 text-red-400 border border-red-500/30"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {w.status === "OPEN" && (
                            <>
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span>مفتوح للحجز</span>
                            </>
                          )}
                          {w.status === "PAUSED" && (
                            <>
                              <Pause className="w-3 h-3 text-amber-400" />
                              <span>موقوف مؤقتاً</span>
                            </>
                          )}
                          {w.status === "CLOSED" && (
                            <>
                              <XCircle className="w-3 h-3 text-red-400" />
                              <span>مغلق</span>
                            </>
                          )}
                          {w.status === "DRAFT" && <span>مسودة</span>}
                        </span>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Open & Broadcast */}
                          {w.status !== "OPEN" ? (
                            <button
                              onClick={() =>
                                handleStatusChange(
                                  w.id,
                                  "OPEN",
                                  targetSubSections[w.id] || w.subSection
                                )
                              }
                              disabled={actionLoading === w.id}
                              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/30 disabled:opacity-50"
                              title={`فتح الحجز وإرسال إشعار فوري لطلاب ${
                                (targetSubSections[w.id] || w.subSection) === "A"
                                  ? "قسم A"
                                  : (targetSubSections[w.id] || w.subSection) === "B"
                                  ? "قسم B"
                                  : "قسمي A و B"
                              } على التيليجرام`}
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>
                                {actionLoading === w.id
                                  ? "جاري الفتح والبث..."
                                  : `فتح الحجز وبث (${
                                      (targetSubSections[w.id] || w.subSection) === "A"
                                        ? "قسم A"
                                        : (targetSubSections[w.id] || w.subSection) === "B"
                                        ? "قسم B"
                                        : "A و B"
                                    })`}
                              </span>
                            </button>
                          ) : (
                            <>
                              {/* If user picked a different subSection while already open, allow updating and rebroadcasting */}
                              {(targetSubSections[w.id] || w.subSection) !== w.subSection && (
                                <button
                                  onClick={() =>
                                    handleStatusChange(
                                      w.id,
                                      "OPEN",
                                      targetSubSections[w.id]
                                    )
                                  }
                                  disabled={actionLoading === w.id}
                                  className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/40 text-xs font-bold transition flex items-center gap-1"
                                  title="تحديث القسم المستهدف وبث إشعار للقسم المختار"
                                >
                                  <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                                  <span>
                                    تحديث لـ (
                                    {targetSubSections[w.id] === "A"
                                      ? "قسم A"
                                      : targetSubSections[w.id] === "B"
                                      ? "قسم B"
                                      : "A و B"}
                                    )
                                  </span>
                                </button>
                              )}

                              {/* Pause */}
                              <button
                                onClick={() => handleStatusChange(w.id, "PAUSED")}
                                disabled={actionLoading === w.id}
                                className="px-3 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-semibold transition flex items-center gap-1 disabled:opacity-50"
                                title="إيقاف الحجز مؤقتاً وبث تنبيه للطلاب"
                              >
                                <Pause className="w-3.5 h-3.5" />
                                <span>إيقاف وبث</span>
                              </button>

                              {/* Close */}
                              <button
                                onClick={() => handleStatusChange(w.id, "CLOSED")}
                                disabled={actionLoading === w.id}
                                className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold transition flex items-center gap-1 disabled:opacity-50"
                                title="إغلاق الحجز نهائياً وبث تنبيه للطلاب"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>إغلاق الفترة</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3.5 sm:p-4">
          <div className="bg-[#0b101d] rounded-2xl border border-slate-800 max-w-lg w-full max-h-[92vh] overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <span>إنشاء فترة حجز جديدة لسكشن</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">المجموعة الدراسية:</label>
                <select
                  required
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">اختر المجموعة...</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">السكشن:</label>
                <select
                  required
                  value={formSectionId}
                  onChange={(e) => setFormSectionId(e.target.value)}
                  disabled={!formGroupId || sections.length === 0}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">اختر السكشن...</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sub-Section Selector */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">القسم المستهدف (A أو B):</label>
                <select
                  value={formSubSection}
                  onChange={(e) => setFormSubSection(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">جميع الأقسام (A و B معاً)</option>
                  <option value="A">قسم A فقط (الطلاب المسجلون بقسم A)</option>
                  <option value="B">قسم B فقط (الطلاب المسجلون بقسم B)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">تاريخ ووقت البداية:</label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">تاريخ ووقت النهاية:</label>
                  <input
                    type="datetime-local"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">الحالة المبدئية للفترة:</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="OPEN">مفتوح للحجز فوراً (مع إشعار الطلاب تلقائياً)</option>
                  <option value="DRAFT">مسودة (غير متاح للطلاب بعد)</option>
                  <option value="PAUSED">موقوف مؤقتاً</option>
                </select>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold transition shadow-md disabled:opacity-50"
                >
                  {submitting ? "جاري الإنشاء..." : "حفظ وإنشاء الفترة"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
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
