"use client";

import React, { useState, useEffect } from "react";
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
  Edit3,
  Power,
  RotateCcw,
  Sparkles,
  Users,
  Layers,
  Check,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";
import { getArabicDayName, format12HourTime, getAcademicTimeMinutes } from "@/lib/utils/datetime";
import { ACADEMIC_YEARS, SPECIALIZATIONS, FREE_SLOT_PERIODS } from "@/lib/constants/academic";

export default function AdminSchedulesPage() {
  // Main Tab State: "BIOMETRICS" | "FREE_SLOTS"
  const [activeTab, setActiveTab] = useState<"BIOMETRICS" | "FREE_SLOTS">("BIOMETRICS");

  // Biometrics Schedules State
  const [schedules, setSchedules] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State for Biometrics Schedule
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [formYear, setFormYear] = useState<string>("الفرقة الثانية");
  const [formSpecialization, setFormSpecialization] = useState<string>("سوفت وير");
  const [formGroupId, setFormGroupId] = useState("");
  const [formSectionId, setFormSectionId] = useState("");
  const [formSubSection, setFormSubSection] = useState<"ALL" | "A" | "B">("ALL");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("13:00");
  const [formVenue, setFormVenue] = useState("مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Biometrics Filters State
  const [filterYear, setFilterYear] = useState("ALL");
  const [filterSpecialization, setFilterSpecialization] = useState("ALL");
  const [filterGroupId, setFilterGroupId] = useState("ALL");
  const [filterSubSection, setFilterSubSection] = useState<"ALL" | "A" | "B">("ALL");

  // Delegate Free Slots State
  const [freeDays, setFreeDays] = useState<any[]>([]);
  const [freeSlots, setFreeSlots] = useState<any[]>([]);
  const [loadingFreeSlots, setLoadingFreeSlots] = useState(false);
  const [freeSpecFilter, setFreeSpecFilter] = useState<string>("ALL");
  const [freeSearch, setFreeSearch] = useState<string>("");
  const [togglingDay, setTogglingDay] = useState<string | null>(null);
  const [maxSlotsPerSection, setMaxSlotsPerSection] = useState(2);
  const [maxSlotsInput, setMaxSlotsInput] = useState(2);
  const [savingMaxSlots, setSavingMaxSlots] = useState(false);
  const [freeSlotsViewMode, setFreeSlotsViewMode] = useState<"GRID" | "LIST">("GRID");

  // Admin Slot Edit/Swap Modal State
  const [adminEditingSlot, setAdminEditingSlot] = useState<any | null>(null);
  const [showAdminSlotModal, setShowAdminSlotModal] = useState(false);
  const [adminSlotGroupId, setAdminSlotGroupId] = useState("");
  const [adminSlotSectionId, setAdminSlotSectionId] = useState("");
  const [adminSlotSections, setAdminSlotSections] = useState<any[]>([]);
  const [adminSlotDelegateName, setAdminSlotDelegateName] = useState("");
  const [adminSlotNotes, setAdminSlotNotes] = useState("");
  const [adminSlotSaving, setAdminSlotSaving] = useState(false);

  const venuePresets = [
    "مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)",
    "شباك الاستقبال المركزي - شؤون الطلاب (الواحة)",
    "معمل الحاسب الآلي الرئيسي — الطابق الأرضي — شباك تسجيل البصمة",
    "المدرج المركزي للكلية — شباك الفحص البيومتري",
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

  const fetchFreeSlots = async () => {
    try {
      setLoadingFreeSlots(true);
      const res = await fetch("/api/free-slots?academicYear=الفرقة الثالثة");
      const json = await res.json();
      if (json.success && json.data) {
        setFreeDays(json.data.days || []);
        setFreeSlots(json.data.slots || []);
        if (json.data.maxSlotsPerSection) {
          setMaxSlotsPerSection(json.data.maxSlotsPerSection);
          setMaxSlotsInput(json.data.maxSlotsPerSection);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFreeSlots(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
    fetchFreeSlots();

    // Fetch groups
    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => j.success && setGroups(j.data.groups || []));
  }, []);

  // Sync groups for form
  const formGroups = groups.filter((g) => {
    const y = g.academicYear || "الفرقة الثانية";
    if (y !== formYear) return false;
    if ((formYear === "الفرقة الثالثة" || formYear === "الفرقة الرابعة") && g.specialization) {
      if (g.specialization !== formSpecialization) return false;
    }
    return true;
  });

  useEffect(() => {
    if (formGroups.length > 0) {
      if (!formGroups.some((g) => g.id === formGroupId)) {
        setFormGroupId(formGroups[0].id);
      }
    } else {
      setFormGroupId("");
      setSections([]);
      setFormSectionId("");
    }
  }, [formYear, formSpecialization, groups]);

  // Fetch sections when formGroupId changes
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
          setSections(j.data.sections || []);
          if (j.data.sections.length > 0 && !editingSchedule) {
            setFormSectionId(j.data.sections[0].id);
          }
        }
      });
  }, [formGroupId]);

  // Fetch sections for admin free slot modal
  useEffect(() => {
    if (!adminSlotGroupId) {
      setAdminSlotSections([]);
      return;
    }
    fetch(`/api/sections?groupId=${adminSlotGroupId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data.sections) {
          setAdminSlotSections(j.data.sections || []);
        }
      });
  }, [adminSlotGroupId]);

  const handleOpenCreateModal = () => {
    setEditingSchedule(null);
    setFormYear("الفرقة الثانية");
    setFormSpecialization("سوفت وير");
    setFormSubSection("ALL");
    setFormDate("");
    setFormStartTime("09:00");
    setFormEndTime("13:00");
    setFormVenue(venuePresets[0]);
    setShowModal(true);
  };

  const handleOpenEditModal = async (sc: any) => {
    setEditingSchedule(sc);
    setFormYear(sc.academicYear || "الفرقة الثانية");
    setFormSpecialization(sc.specialization || "سوفت وير");
    setFormGroupId(sc.groupId || "");
    setFormSubSection(sc.subSection || "ALL");
    setFormDate(sc.date || "");
    setFormStartTime(sc.startTime || "09:00");
    setFormEndTime(sc.endTime || "13:00");
    setFormVenue(sc.notes || venuePresets[0]);

    if (sc.groupId) {
      try {
        const res = await fetch(`/api/sections?groupId=${sc.groupId}`);
        const j = await res.json();
        if (j.success && j.data.sections) {
          setSections(j.data.sections);
        }
      } catch (err) {
        console.error(err);
      }
    }
    setFormSectionId(sc.sectionId || "");
    setShowModal(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const isEdit = Boolean(editingSchedule);
      const url = "/api/schedules";
      const method = isEdit ? "PUT" : "POST";
      const bodyPayload = {
        ...(isEdit ? { id: editingSchedule.id } : {}),
        sectionId: formSectionId,
        subSection: formSubSection,
        date: formDate,
        startTime: formStartTime,
        endTime: formEndTime,
        notes: formVenue.trim(),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل حفظ الموعد", type: "error" });
        return;
      }

      setFeedback({
        message: isEdit
          ? "تم تحديث وتعديل الموعد في الجدول الرسمي بنجاح!"
          : "تمت إضافة الموعد ومقر البصمة إلى الجدول الرسمي بنجاح!",
        type: "success",
      });
      setShowModal(false);
      setEditingSchedule(null);
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

  // Toggle Free Slots Day Open/Closed Status
  const handleToggleDay = async (dayName: string, currentOpen: boolean) => {
    try {
      setTogglingDay(dayName);
      setFeedback(null);
      const res = await fetch("/api/free-slots/days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayName, isOpen: !currentOpen }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ message: json.message, type: "success" });
        await fetchFreeSlots();
      } else {
        setFeedback({ message: json.error || "فشل تغيير حالة اليوم", type: "error" });
      }
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setTogglingDay(null);
    }
  };

  // Update Max Free Slots allowed for delegates per section
  const handleSaveMaxSlots = async (val: number) => {
    try {
      setSavingMaxSlots(true);
      setFeedback(null);
      const res = await fetch("/api/free-slots/days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxSlotsPerSection: val }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMaxSlotsPerSection(val);
        setMaxSlotsInput(val);
        setFeedback({
          message: `تم تحديد الحد الأقصى لفترات المناديب بـ (${val}) فترات بنجاح`,
          type: "success",
        });
      } else {
        setFeedback({ message: json.error || "فشل حفظ الحد الأقصى", type: "error" });
      }
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setSavingMaxSlots(false);
    }
  };

  // Delete Free Slot
  const handleDeleteFreeSlot = async (slotId: string, sectionName: string) => {
    if (!confirm(`هل أنت متأكد من إلغاء وحذف حجز هذه الفترة لسكشن "${sectionName}"؟`)) return;
    try {
      setFeedback(null);
      const res = await fetch(`/api/free-slots/admin?id=${slotId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ message: json.message, type: "success" });
        await fetchFreeSlots();
      } else {
        setFeedback({ message: json.error || "فشل إلغاء الفترة", type: "error" });
      }
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    }
  };

  // Open Admin Slot Edit Modal
  const handleOpenAdminSlotModal = (slot: any) => {
    setAdminEditingSlot(slot);
    setAdminSlotGroupId(slot.groupId || "");
    setAdminSlotSectionId(slot.sectionId || "");
    setAdminSlotDelegateName(slot.delegateName || "");
    setAdminSlotNotes(slot.notes || "");
    setShowAdminSlotModal(true);
  };

  // Save Admin Slot Modification
  const handleSaveAdminSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEditingSlot) return;

    try {
      setAdminSlotSaving(true);
      setFeedback(null);
      const res = await fetch("/api/free-slots/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: adminEditingSlot.id,
          groupId: adminSlotGroupId || undefined,
          sectionId: adminSlotSectionId || undefined,
          delegateName: adminSlotDelegateName.trim() || undefined,
          notes: adminSlotNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ message: json.message, type: "success" });
        setShowAdminSlotModal(false);
        setAdminEditingSlot(null);
        await fetchFreeSlots();
      } else {
        setFeedback({ message: json.error || "فشل تعديل الفترة", type: "error" });
      }
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setAdminSlotSaving(false);
    }
  };

  const handlePrintPDF = () => {
    window.print();
  };

  // Filtered Biometrics Schedules
  const filteredSchedules = schedules
    .filter((sc) => {
      if (filterYear !== "ALL" && (sc.academicYear || "الفرقة الثانية") !== filterYear) return false;
      if (filterSpecialization !== "ALL" && sc.specialization && sc.specialization !== filterSpecialization) return false;
      if (filterGroupId !== "ALL" && sc.groupId !== filterGroupId) return false;
      if (filterSubSection !== "ALL" && sc.subSection !== "ALL" && sc.subSection !== filterSubSection) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.date !== b.date) {
        return (a.date || "").localeCompare(b.date || "");
      }
      const aMin = getAcademicTimeMinutes(a.startTime);
      const bMin = getAcademicTimeMinutes(b.startTime);
      return aMin - bMin;
    });

  // Filtered Free Slots
  const filteredFreeSlots = freeSlots.filter((s) => {
    if (freeSpecFilter !== "ALL" && s.specialization !== freeSpecFilter) return false;
    if (freeSearch) {
      const q = freeSearch.trim().toLowerCase();
      const matchName = (s.delegateName || "").toLowerCase().includes(q);
      const matchSec = (s.sectionName || "").toLowerCase().includes(q);
      const matchDay = (s.dayName || "").toLowerCase().includes(q);
      if (!matchName && !matchSec && !matchDay) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white p-1.5 shadow-xl shadow-blue-500/20 border border-slate-700/60 flex-shrink-0 flex items-center justify-center">
            <img
              src="/images/batu-logo.png"
              alt="جامعة برج العرب التكنولوجية"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">
                ACADEMIC TIMETABLE • إدارة الجداول وفترات الفراغ
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              إدارة جداول الحضور وفترات فراغ السكاشن
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              التحكم في المواعيد الرسمية المعتمدة للبصمة، وإدارة حجز فترات الفراغ لمناديب سكاشن الفرقة الثالثة (فتح/قفل الأيام وتبديل السكاشن).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {activeTab === "BIOMETRICS" && (
            <>
              <button
                onClick={handleOpenCreateModal}
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
                <span>طباعة جدول البصمة اليدوي PDF</span>
              </button>
            </>
          )}

          {activeTab === "FREE_SLOTS" && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handlePrintPDF}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition flex items-center gap-2"
              >
                <Printer className="w-4 h-4 text-white" />
                <span>طباعة جدول فترات الفراغ PDF</span>
              </button>
              <button
                onClick={fetchFreeSlots}
                disabled={loadingFreeSlots}
                className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-2 disabled:opacity-50"
              >
                <RotateCcw className={`w-4 h-4 ${loadingFreeSlots ? "animate-spin" : ""}`} />
                <span>تحديث الفترات</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="print:hidden flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-xl">
        <button
          onClick={() => setActiveTab("BIOMETRICS")}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 ${
            activeTab === "BIOMETRICS"
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>جدول مواعيد بصمة الوجه المعتمد</span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-black/20 text-blue-200">
            {schedules.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("FREE_SLOTS")}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 ${
            activeTab === "FREE_SLOTS"
              ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-600/30 border border-purple-400/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>إدارة فترات فراغ الفرقة الثالثة (المناديب)</span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-black/20 text-purple-200">
            {freeSlots.length} فترات
          </span>
        </button>
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

      {/* TAB 1: OFFICIAL BIOMETRICS SCHEDULE */}
      {activeTab === "BIOMETRICS" && (
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-10 backdrop-blur-xl text-white print:bg-white print:text-black print:border-none print:shadow-none print:p-0 space-y-6">
          {/* Printable Official University Header */}
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
              الجدول الرسمي المعتمد لتسجيل بصمة الوجه {filterYear !== "ALL" ? `(${filterYear})` : ""}
            </h3>
            <div className="flex items-center justify-center gap-4 text-xs font-bold text-slate-700 mt-2">
              <span>العام الجامعي: 2026 / 2027</span>
              <span>•</span>
              <span>تاريخ الطباعة: {new Date().toLocaleDateString("ar-EG")}</span>
              <span>•</span>
              <span className="text-emerald-800 font-bold">معتمد رسمياً للنشر</span>
            </div>
          </div>

          {/* Schedule Title (Screen Only) */}
          <div className="print:hidden text-center">
            <h2 className="text-xl sm:text-2xl font-black text-white">
              الجدول الرسمي المعتمد لتسجيل بصمة الوجه
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              قسم تكنولوجيا المعلومات — يرجى الالتزام التام بالمواعيد والمقرات المحددة لكل سكشن
            </p>
          </div>

          {/* Biometrics Filter Controls */}
          <div className="print:hidden p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              {/* Year Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-400">الفرقة:</span>
                <select
                  value={filterYear}
                  onChange={(e) => {
                    setFilterYear(e.target.value);
                    setFilterGroupId("ALL");
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  <option value="ALL">جميع الفرق</option>
                  {ACADEMIC_YEARS.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Specialization Filter */}
              {(filterYear === "ALL" || filterYear === "الفرقة الثالثة" || filterYear === "الفرقة الرابعة") && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-400">الشعبة:</span>
                  <select
                    value={filterSpecialization}
                    onChange={(e) => {
                      setFilterSpecialization(e.target.value);
                      setFilterGroupId("ALL");
                    }}
                    className="px-3 py-1.5 rounded-xl border border-purple-500/40 bg-slate-900 text-xs text-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold"
                  >
                    <option value="ALL">جميع الشعب</option>
                    {SPECIALIZATIONS.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Group Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-400">المجموعة:</span>
                <select
                  value={filterGroupId}
                  onChange={(e) => setFilterGroupId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  <option value="ALL">جميع المجموعات</option>
                  {groups
                    .filter((g) => {
                      if (filterYear !== "ALL" && (g.academicYear || "الفرقة الثانية") !== filterYear) return false;
                      if (filterSpecialization !== "ALL" && g.specialization && g.specialization !== filterSpecialization)
                        return false;
                      return true;
                    })
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* SubSection Filter */}
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

            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
              <div className="text-xs text-slate-400 font-mono">
                المواعيد المعروضة:{" "}
                <span className="text-white font-bold">{filteredSchedules.length}</span> من أصل {schedules.length}
              </div>
              <button
                type="button"
                onClick={handlePrintPDF}
                className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition flex items-center gap-1.5"
                title="طباعة الجدول اليدوي المعتمد بصيغة PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة PDF</span>
              </button>
            </div>
          </div>

          {/* Schedule Table */}
          {loading ? (
            <div className="p-16 text-center text-slate-400 text-sm space-y-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>جاري تحميل مواعيد السكاشن...</p>
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              لا توجد مواعيد مضافة في الجدول تطابق الفلاتر المحددة. اضغط على «إضافة موعد ومكان لسكشن» للبدء.
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar print:overflow-visible">
              <table className="w-full text-right border-collapse border border-slate-700 print:border-2 print:border-black text-xs sm:text-sm min-w-[850px] print:min-w-0">
                <thead>
                  <tr className="bg-[#0b101d] border-b-2 border-slate-700 text-slate-200 text-xs font-black print:bg-slate-100 print:text-black print:border-b-2 print:border-black">
                    <th className="p-3 border border-slate-700 print:border print:border-black text-center w-12 bg-slate-900/90 print:bg-slate-100">
                      م
                    </th>
                    <th className="p-3 border border-slate-700 print:border print:border-black bg-slate-900/90 print:bg-slate-100">
                      الفرقة والشعبة
                    </th>
                    <th className="p-3 border border-slate-700 print:border print:border-black bg-slate-900/90 print:bg-slate-100">
                      المجموعة
                    </th>
                    <th className="p-3 border border-slate-700 print:border print:border-black bg-slate-900/90 print:bg-slate-100">
                      السكشن
                    </th>
                    <th className="p-3 border border-slate-700 print:border print:border-black text-center bg-slate-900/90 print:bg-slate-100">
                      القسم (A / B)
                    </th>
                    <th className="p-3 border border-slate-700 print:border print:border-black text-center bg-slate-900/90 print:bg-slate-100">
                      اليوم والتاريخ
                    </th>
                    <th className="p-3 border border-slate-700 print:border print:border-black text-center bg-slate-900/90 print:bg-slate-100">
                      فترة الحضور
                    </th>
                    <th className="p-3 border border-slate-700 print:border print:border-black bg-slate-900/90 print:bg-slate-100">
                      المقر وقاعة البصمة بالتفصيل
                    </th>
                    <th className="p-3 border border-slate-700 print:hidden text-center bg-slate-900/90">
                      إجراءات
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/80 text-xs sm:text-sm">
                  {filteredSchedules.map((sc, idx) => (
                    <tr
                      key={sc.id}
                      className="hover:bg-blue-950/20 even:bg-slate-900/40 odd:bg-[#070b14]/60 border-b border-slate-700/80 transition print:bg-white print:border print:border-black print:text-black"
                    >
                      <td className="p-3 border border-slate-700 print:border print:border-black text-center font-bold font-mono print:text-black bg-slate-950/40 print:bg-transparent">
                        {idx + 1}
                      </td>
                      <td className="p-3 border border-slate-700 print:border print:border-black font-bold text-slate-200 print:text-black">
                        <div>{sc.academicYear || "الفرقة الثانية"}</div>
                        {sc.specialization && sc.specialization !== "عام" ? (
                          <div className="text-[11px] font-semibold text-cyan-400 print:text-slate-700">
                            {sc.specialization}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-500 print:text-slate-600">عام</div>
                        )}
                      </td>
                      <td className="p-3 border border-slate-700 print:border print:border-black font-bold text-white print:text-black">
                        {sc.groupName}
                      </td>
                      <td className="p-3 border border-slate-700 print:border print:border-black font-black text-blue-400 font-mono print:text-black">
                        {sc.sectionName} ({sc.sectionCode})
                      </td>
                      <td className="p-3 border border-slate-700 print:border print:border-black text-center">
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
                            A و B معاً
                          </span>
                        )}
                      </td>
                      <td className="p-3 border border-slate-700 print:border print:border-black text-center">
                        <div className="inline-flex flex-col items-center justify-center">
                          <span className="font-black text-amber-400 print:text-black text-sm">
                            {getArabicDayName(sc.date) || "—"}
                          </span>
                          <span className="text-[11px] font-mono text-slate-300 print:text-slate-800 mt-0.5" dir="ltr">
                            {sc.date}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 border border-slate-700 print:border print:border-black text-center font-bold text-slate-200 print:text-black">
                        <span className="inline-flex items-center gap-1 font-mono text-xs sm:text-sm">
                          <span>من {format12HourTime(sc.startTime)}</span>
                          <span className="text-slate-500 print:text-black">إلى</span>
                          <span>{format12HourTime(sc.endTime)}</span>
                        </span>
                      </td>
                      <td className="p-3 border border-slate-700 print:border print:border-black text-xs text-slate-300 font-medium print:text-black">
                        {sc.notes || "مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)"}
                      </td>
                      <td className="p-3 border border-slate-700 print:hidden text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleOpenEditModal(sc)}
                            className="p-1.5 px-2.5 rounded-lg bg-blue-950/50 hover:bg-blue-900/70 text-blue-300 hover:text-white text-xs font-bold transition border border-blue-500/40 inline-flex items-center gap-1 shadow-sm"
                            title="تعديل الموعد ومقر البصمة"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSchedule(sc.id)}
                            className="p-1.5 px-2.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-100 text-xs font-bold transition border border-red-500/30 inline-flex items-center gap-1 shadow-sm"
                            title="حذف الموعد"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DELEGATE FREE SLOTS MANAGEMENT */}
      {activeTab === "FREE_SLOTS" && (
        <div className="space-y-6">
          {/* Day Lock/Unlock Status Controls & Delegate Max Slots Setting */}
          <div className="print:hidden bg-slate-900/90 rounded-3xl border border-slate-800 p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-slate-800 mb-6 gap-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Power className="w-5 h-5 text-amber-400" />
                  <span>التحكم في فتح وغلق أيام تسجيل فترات الفراغ للمناديب</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  اليوم المغلق يظهر مظلماً تماماً وغير قابل للاختيار في شاشة المندوب، واليوم المفتوح يتيح حجز الفترات المتاحة.
                </p>
              </div>

              {/* Super Admin Control: Set Max Selectable Free Slots per Delegate */}
              <div className="bg-slate-950 p-3 sm:p-3.5 rounded-2xl border border-purple-500/40 flex items-center gap-3 shadow-lg shadow-purple-950/30 flex-shrink-0">
                <div className="text-right">
                  <span className="text-xs font-black text-purple-300 block">
                    حد فترات المندوب (الحد الأقصى):
                  </span>
                  <span className="text-[10px] text-slate-400">
                    عدد الفترات المسموح للمندوب بحجزها لسكشنه
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={maxSlotsInput}
                    onChange={(e) => setMaxSlotsInput(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 px-2.5 py-1.5 rounded-xl border border-purple-500/50 bg-slate-900 text-white font-mono font-black text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveMaxSlots(maxSlotsInput)}
                    disabled={savingMaxSlots || maxSlotsInput === maxSlotsPerSection}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-md shadow-purple-600/30"
                  >
                    {savingMaxSlots ? "حفظ..." : "حفظ التحديد"}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {freeDays.map((d) => (
                <div
                  key={d.id || d.dayName}
                  className={`p-4 rounded-2xl border transition flex flex-col items-center justify-between gap-3 text-center ${
                    d.isOpen
                      ? "bg-emerald-950/30 border-emerald-500/40 shadow-lg shadow-emerald-950/30"
                      : "bg-slate-950/80 border-slate-800 text-slate-500 opacity-80"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="text-sm font-black text-white">{d.dayName}</div>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        d.isOpen
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                      }`}
                    >
                      {d.isOpen ? "مفتوح للتسجيل" : "مغلق ومظلم"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleDay(d.dayName, d.isOpen)}
                    disabled={togglingDay === d.dayName}
                    className={`w-full py-1.5 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                      d.isOpen
                        ? "bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30"
                    } disabled:opacity-50`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{togglingDay === d.dayName ? "جاري الحفظ..." : d.isOpen ? "قفل اليوم" : "فتح اليوم"}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Booked Slots Management Table */}
          <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 sm:p-10 shadow-2xl backdrop-blur-xl space-y-6 text-white print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
            {/* Print Styles for Landscape */}
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

            {/* Printable Official University Header for Free Slots */}
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
              <h3 className="text-base font-extrabold text-purple-900 mt-2 bg-slate-100 px-4 py-1 rounded-lg border border-slate-300 inline-block">
                الجدول الرسمي المعتمد لفترات فراغ سكاشن الفرقة الثالثة (المعتمد بواسطة المناديب)
                {freeSpecFilter !== "ALL" ? ` • شعبة ${freeSpecFilter}` : ""}
              </h3>
              <div className="flex items-center justify-center gap-4 text-xs font-bold text-slate-700 mt-2">
                <span>العام الجامعي: 2026 / 2027</span>
                <span>•</span>
                <span>تاريخ الطباعة: {new Date().toLocaleDateString("ar-EG")}</span>
                <span>•</span>
                <span className="text-emerald-800 font-bold">معتمد رسمياً للنشر والطباعة</span>
              </div>
            </div>

            <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  <span>الفترات المحجوزة حالياً لسكاشن الفرقة الثالثة</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  يمكن للمشرف العام تعديل أي فترة، استبدال سكشن بآخر، أو إلغاء حجز مندوب ما بضغطة زر واحدة.
                </p>
              </div>

              {/* Specialization Filter, Search & PDF Print Button */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintPDF}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-black shadow-md shadow-purple-600/30 transition flex items-center gap-1.5"
                  title="طباعة وتصدير جدول فترات الفراغ بصيغة PDF (بالعرض)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة جدول الفراغ PDF</span>
                </button>

                {/* View Mode Switcher */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setFreeSlotsViewMode("GRID")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                      freeSlotsViewMode === "GRID"
                        ? "bg-purple-600 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                    title="عرض الجدول الأفقي الموحد (بالعرض)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>الجدول الأفقي (بالعرض)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFreeSlotsViewMode("LIST")}
                    className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                      freeSlotsViewMode === "LIST"
                        ? "bg-purple-600 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                    title="عرض قائمة تفصيلية"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>قائمة</span>
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  {["ALL", "سوفت وير", "نيتورك"].map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setFreeSpecFilter(sp)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition ${
                        freeSpecFilter === sp
                          ? "bg-purple-600 text-white shadow"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {sp === "ALL" ? "جميع الشعب" : sp}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={freeSearch}
                    onChange={(e) => setFreeSearch(e.target.value)}
                    placeholder="بحث بالمندوب أو السكشن..."
                    className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 w-44 sm:w-56"
                  />
                  {freeSearch && (
                    <button
                      onClick={() => setFreeSearch("")}
                      className="absolute left-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loadingFreeSlots ? (
              <div className="p-16 text-center text-slate-400 text-sm space-y-3">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p>جاري تحميل فترات الفراغ...</p>
              </div>
            ) : freeSlotsViewMode === "GRID" ? (
              /* HORIZONTAL GRID TABLE (Days as rows, Periods 1-9 along columns across the top) */
              <div className="overflow-x-auto custom-scrollbar print:overflow-visible">
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
                    {freeDays.map((day) => {
                      const isDayOpen = day.isOpen;
                      return (
                        <tr
                          key={day.id || day.dayName}
                          className="hover:bg-purple-950/10 transition print:bg-white print:border print:border-black"
                        >
                          {/* Day Row Header (Rightmost Column) */}
                          <td
                            className={`p-3 text-center border-l border-slate-800 print:border print:border-black font-bold space-y-1 ${
                              isDayOpen
                                ? "bg-[#070b14] print:bg-slate-50"
                                : "bg-red-950/20 text-slate-500 print:bg-slate-200 print:text-slate-700"
                            }`}
                          >
                            <div className="text-sm font-black text-white print:text-black">{day.dayName}</div>
                            <div className="print:hidden">
                              {isDayOpen ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                  مفتوح
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-bold bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded-full">
                                  مغلق
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 9 Period Columns for this Day */}
                          {FREE_SLOT_PERIODS.map((period) => {
                            const cellSlots = filteredFreeSlots.filter(
                              (s) => s.dayName === day.dayName && s.periodIndex === period.index
                            );

                            return (
                              <td
                                key={`${day.dayName}-${period.index}`}
                                className="p-1.5 border-l border-slate-800 print:border print:border-black align-top min-w-[105px] h-24 print:h-auto"
                              >
                                {cellSlots.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {cellSlots.map((slot) => (
                                      <div
                                        key={slot.id}
                                        className={`p-2 rounded-xl border flex flex-col justify-between text-right space-y-1 transition print:bg-white print:border print:border-black ${
                                          slot.specialization === "سوفت وير"
                                            ? "bg-cyan-950/50 border-cyan-500/40 text-cyan-200"
                                            : "bg-purple-950/50 border-purple-500/40 text-purple-200"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span
                                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-full print:border print:border-black print:text-black print:bg-transparent ${
                                              slot.specialization === "سوفت وير"
                                                ? "bg-cyan-500/20 text-cyan-300"
                                                : "bg-purple-500/20 text-purple-300"
                                            }`}
                                          >
                                            {slot.specialization}
                                          </span>
                                          <span className="text-[10px] font-extrabold text-white print:text-black truncate">
                                            {slot.sectionName}
                                          </span>
                                        </div>

                                        <div
                                          className="text-[10px] text-slate-300 print:text-slate-800 truncate"
                                          title={slot.groupName}
                                        >
                                          {slot.groupName}
                                        </div>

                                        <div
                                          className="text-[9px] font-semibold text-amber-300 print:text-slate-800 truncate"
                                          title={slot.delegateName}
                                        >
                                          👤 {slot.delegateName || "مندوب السكشن"}
                                        </div>

                                        {/* Admin Action Buttons (Hidden on Print) */}
                                        <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-800/60 print:hidden">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenAdminSlotModal(slot)}
                                            className="p-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 text-[10px] transition"
                                            title="تعديل السكشن أو المندوب"
                                          >
                                            <Edit3 className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteFreeSlot(slot.id, slot.sectionName)}
                                            className="p-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-[10px] transition"
                                            title="إلغاء حجز هذه الفترة"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : filteredFreeSlots.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                لا توجد فترات فراغ محجوزة تطابق الفلتر المحدد حتى الآن.
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar print:overflow-visible">
                <table className="w-full text-right border-collapse border border-slate-800 print:border-2 print:border-black text-xs sm:text-sm min-w-[850px] print:min-w-0">
                  <thead>
                    <tr className="bg-[#0b101d] border-b border-slate-800 text-slate-300 text-xs font-black print:bg-slate-100 print:text-black print:border-b-2 print:border-black">
                      <th className="p-3 border border-slate-800 print:border print:border-black text-center w-12 print:text-black">م</th>
                      <th className="p-3 border border-slate-800 print:border print:border-black print:text-black">اليوم</th>
                      <th className="p-3 border border-slate-800 print:border print:border-black print:text-black">الفترة والتوقيت</th>
                      <th className="p-3 border border-slate-800 print:border print:border-black print:text-black">الشعبة</th>
                      <th className="p-3 border border-slate-800 print:border print:border-black print:text-black">المجموعة والسكشن</th>
                      <th className="p-3 border border-slate-800 print:border print:border-black print:text-black">اسم المندوب المسؤول</th>
                      <th className="p-3 border border-slate-800 print:border print:border-black print:text-black">الملاحظات</th>
                      <th className="p-3 border border-slate-800 text-center print:hidden">إجراءات الإدارة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs sm:text-sm">
                    {filteredFreeSlots.map((slot, idx) => (
                      <tr key={slot.id} className="hover:bg-purple-950/20 even:bg-slate-950/40 odd:bg-slate-900/40 transition print:bg-white print:border print:border-black print:text-black">
                        <td className="p-3 border border-slate-800 print:border print:border-black text-center font-bold font-mono text-slate-400 print:text-black">
                          {idx + 1}
                        </td>
                        <td className="p-3 border border-slate-800 print:border print:border-black font-bold text-amber-400 print:text-black">
                          {slot.dayName}
                        </td>
                        <td className="p-3 border border-slate-800 print:border print:border-black font-bold text-white print:text-black">
                          <div className="text-cyan-300 font-bold print:text-black">{slot.periodName}</div>
                          <div className="text-[11px] font-mono text-slate-400 print:text-slate-800 mt-0.5">
                            {format12HourTime(slot.startTime)} - {format12HourTime(slot.endTime)}
                          </div>
                        </td>
                        <td className="p-3 border border-slate-800 print:border print:border-black font-bold print:text-black">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-black print:border print:border-slate-800 print:bg-slate-100 print:text-black ${
                              slot.specialization === "سوفت وير"
                                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                : "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                            }`}
                          >
                            {slot.specialization}
                          </span>
                        </td>
                        <td className="p-3 border border-slate-800 print:border print:border-black print:text-black">
                          <div className="font-extrabold text-white print:text-black text-sm">{slot.sectionName}</div>
                          <div className="text-xs text-slate-400 print:text-slate-800">{slot.groupName}</div>
                        </td>
                        <td className="p-3 border border-slate-800 print:border print:border-black print:text-black">
                          <div className="font-bold text-white print:text-black flex items-center gap-1.5 flex-wrap">
                            <span>{slot.delegateName || "مندوب السكشن"}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-black print:border print:border-slate-800 print:bg-slate-100 print:text-black">
                              ⭐ مندوب
                            </span>
                          </div>
                        </td>
                        <td className="p-3 border border-slate-800 print:border print:border-black text-slate-400 print:text-black text-xs">
                          {slot.notes || "فترة فراغ سكشن رسمية"}
                        </td>
                        <td className="p-3 border border-slate-800 text-center print:hidden">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleOpenAdminSlotModal(slot)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold transition flex items-center gap-1"
                              title="تعديل السكشن أو المندوب"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل/تبديل</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFreeSlot(slot.id, slot.sectionName)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1"
                              title="إلغاء حجز هذه الفترة"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>إلغاء</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Biometrics Schedule Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#0b101d] rounded-2xl border border-slate-800 max-w-lg w-full p-6 space-y-4 shadow-2xl text-white my-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <span>{editingSchedule ? "تعديل موعد بصمة لسكشن" : "إضافة موعد ومقر جديد لسكشن"}</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4 text-xs">
              {/* Year & Specialization */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">الفرقة الدراسية:</label>
                  <select
                    value={formYear}
                    onChange={(e) => setFormYear(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    {ACADEMIC_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                {(formYear === "الفرقة الثالثة" || formYear === "الفرقة الرابعة") && (
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">الشعبة التخصصية:</label>
                    <select
                      value={formSpecialization}
                      onChange={(e) => setFormSpecialization(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-cyan-500/40 bg-slate-950 text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-bold"
                    >
                      {SPECIALIZATIONS.map((sp) => (
                        <option key={sp} value={sp}>
                          {sp}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Group & Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">المجموعة:</label>
                  <select
                    required
                    value={formGroupId}
                    onChange={(e) => setFormGroupId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  >
                    <option value="">اختر المجموعة...</option>
                    {formGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
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
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 font-semibold"
                  >
                    <option value="">اختر السكشن...</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sub-Section */}
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
                {formDate && (
                  <div className="mt-1.5 text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <span>اليوم بالجدول:</span>
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 font-black">
                      {getArabicDayName(formDate)}
                    </span>
                  </div>
                )}
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
                  placeholder="مثال: مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

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
                  {submitting ? "جاري الحفظ..." : editingSchedule ? "حفظ التعديلات" : "حفظ الموعد بالجدول"}
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

      {/* Admin Free Slot Edit / Swap Modal */}
      {showAdminSlotModal && adminEditingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#0b101d] rounded-2xl border border-purple-500/40 max-w-lg w-full p-6 space-y-4 shadow-2xl text-white my-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-purple-400" />
                <span>تعديل أو تبديل فترة سكشن (الفرقة الثالثة)</span>
              </h3>
              <button
                onClick={() => {
                  setShowAdminSlotModal(false);
                  setAdminEditingSlot(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs text-purple-200">
              <div className="font-bold text-white mb-1">تفاصيل الفترة المختارة:</div>
              <div>اليوم: <b>{adminEditingSlot.dayName}</b> • الفترة: <b>{adminEditingSlot.periodName} ({format12HourTime(adminEditingSlot.startTime)} - {format12HourTime(adminEditingSlot.endTime)})</b></div>
              <div>الشعبة: <b>{adminEditingSlot.specialization}</b></div>
            </div>

            <form onSubmit={handleSaveAdminSlot} className="space-y-4 text-xs">
              {/* Group */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">المجموعة:</label>
                <select
                  required
                  value={adminSlotGroupId}
                  onChange={(e) => setAdminSlotGroupId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold"
                >
                  <option value="">اختر المجموعة...</option>
                  {groups
                    .filter((g) => {
                      const y = g.academicYear || "الفرقة الثانية";
                      return y === "الفرقة الثالثة" && g.specialization === adminEditingSlot.specialization;
                    })
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Section */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">السكشن الجديد المخصص للفترة:</label>
                <select
                  required
                  value={adminSlotSectionId}
                  onChange={(e) => setAdminSlotSectionId(e.target.value)}
                  disabled={!adminSlotGroupId || adminSlotSections.length === 0}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 font-semibold"
                >
                  <option value="">اختر السكشن...</option>
                  {adminSlotSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Delegate Name */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">اسم المندوب المسؤول:</label>
                <input
                  type="text"
                  value={adminSlotDelegateName}
                  onChange={(e) => setAdminSlotDelegateName(e.target.value)}
                  placeholder="اسم المندوب..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">ملاحظات إضافية:</label>
                <textarea
                  rows={2}
                  value={adminSlotNotes}
                  onChange={(e) => setAdminSlotNotes(e.target.value)}
                  placeholder="ملاحظات حول تبديل أو تخصيص الفترة..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  type="submit"
                  disabled={adminSlotSaving}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-purple-600/30 transition flex items-center justify-center gap-2"
                >
                  {adminSlotSaving ? "جاري حفظ التعديلات..." : "حفظ التعديل وتبديل السكشن"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminSlotModal(false);
                    setAdminEditingSlot(null);
                  }}
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
