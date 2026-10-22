"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import {
  Users,
  Search,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  Filter,
  X,
  Building2,
  Folder,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  LogIn,
  RotateCcw,
  UserCheck,
  FileSpreadsheet,
  Trash2,
  CheckSquare,
  Square,
  UserPlus,
  ArrowRightLeft,
  Sparkles,
  Edit3,
  Copy,
  Check,
  Info,
  Calendar,
  Layers,
  Fingerprint,
  SlidersHorizontal,
} from "lucide-react";

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportActivatedLoading, setExportActivatedLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Bulk Selection State
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Filters
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedSubSection, setSelectedSubSection] = useState("");
  const [activationFilter, setActivationFilter] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [search, setSearch] = useState("");

  const [staffList, setStaffList] = useState<any[]>([]);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [stats, setStats] = useState<{
    totalRegistered: number;
    totalActivated: number;
    totalNotActivated: number;
    filteredStaffDateCount: number | null;
  }>({
    totalRegistered: 0,
    totalActivated: 0,
    totalNotActivated: 0,
    filteredStaffDateCount: null,
  });

  // Manual Student Entry / Overwrite Modal State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualSections, setManualSections] = useState<any[]>([]);
  const [manualForm, setManualForm] = useState({
    fullName: "",
    nationalId: "",
    academicNumber: "",
    groupId: "",
    sectionId: "",
    subSection: "A",
    isFingerprintActivated: false,
  });

  const [conflictData, setConflictData] = useState<null | {
    message: string;
    existingStudent: {
      id: string;
      fullName: string;
      academicNumber: string;
      nationalId: string;
      groupName: string;
      sectionName: string;
      subSection: string;
      isActivated: boolean;
      activatedAt: string | null;
    };
    newData: {
      fullName: string;
      academicNumber: string;
      nationalId: string;
      groupName: string;
      sectionName: string;
      subSection: string;
      isFingerprintActivated: boolean;
    };
  }>(null);

  // Load user session, groups, and staff on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.user) setSessionUser(j.data.user);
      })
      .catch(() => {});

    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => j.success && setGroups(j.data.groups || []));

    fetch("/api/admin/staff")
      .then((r) => r.json())
      .then((j) => j.success && setStaffList(j.data?.staff || []));
  }, []);

  const isSuperAdmin = sessionUser?.role === "SUPER_ADMIN";

  // Load sections when filter group changes
  useEffect(() => {
    if (!selectedGroup) {
      setSelectedSection("");
      setSections([]);
      return;
    }
    fetch(`/api/sections?groupId=${selectedGroup}`)
      .then((r) => r.json())
      .then((j) => j.success && setSections(j.data.sections || []));
  }, [selectedGroup]);

  // Load sections when manual modal group changes
  useEffect(() => {
    if (!manualForm.groupId) {
      setManualSections([]);
      return;
    }
    fetch(`/api/sections?groupId=${manualForm.groupId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const list = j.data.sections || [];
          setManualSections(list);
          if (list.length > 0 && (!manualForm.sectionId || !list.some((s: any) => s.id === manualForm.sectionId))) {
            setManualForm((prev) => ({ ...prev, sectionId: list[0].id }));
          }
        }
      });
  }, [manualForm.groupId]);

  const fetchStudents = async (overrideSearch?: string | unknown) => {
    try {
      setLoading(true);
      setAuthError(false);
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "25");
      if (selectedGroup) params.set("groupId", selectedGroup);
      if (selectedSection) params.set("sectionId", selectedSection);
      if (selectedSubSection) params.set("subSection", selectedSubSection);
      if (activationFilter) params.set("activationStatus", activationFilter);
      if (selectedStaff) params.set("staffId", selectedStaff);
      if (selectedDate) params.set("activationDate", selectedDate);
      const effectiveSearch = typeof overrideSearch === "string" ? overrideSearch : search;
      if (effectiveSearch) params.set("search", effectiveSearch);

      const res = await fetch(`/api/students?${params.toString()}`);

      if (res.status === 401 || res.status === 403) {
        setAuthError(true);
        setStudents([]);
        setTotal(0);
        return;
      }

      const json = await res.json();
      if (json.success && json.data?.items) {
        setStudents(json.data.items);
        setTotal(json.data.total);
        if (json.data.stats) {
          setStats(json.data.stats);
        }
      } else {
        setStudents([]);
        setTotal(0);
      }
    } catch (err) {
      console.error(err);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSearch("");
    setPage(1);
    fetchStudents("");
  };

  const handleResetAllFilters = () => {
    setSelectedGroup("");
    setSelectedSection("");
    setSelectedSubSection("");
    setActivationFilter("");
    setSelectedStaff("");
    setSelectedDate("");
    setSearch("");
    setPage(1);
    fetchStudents("");
  };

  const handleExportExcel = async () => {
    try {
      setExportLoading(true);
      const params = new URLSearchParams();
      if (selectedGroup) params.set("groupId", selectedGroup);
      if (selectedSection) params.set("sectionId", selectedSection);
      if (selectedSubSection) params.set("subSection", selectedSubSection);
      if (activationFilter) params.set("activationStatus", activationFilter);
      if (selectedStaff) params.set("staffId", selectedStaff);
      if (selectedDate) params.set("activationDate", selectedDate);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/students/export?${params.toString()}`);
      if (!res.ok) {
        throw new Error("فشل تصدير ملف الإكسيل");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BATU_Students_Directory_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setFeedback({ message: "تم تصدير كشف الطلاب بنجاح بصيغة Excel مع فصل المفعلين بشيت مستقل!", type: "success" });
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ أثناء تصدير شيت الإكسيل", type: "error" });
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportActivatedExcel = async () => {
    try {
      setExportActivatedLoading(true);
      const params = new URLSearchParams();
      params.set("mode", "activated_only");
      if (selectedGroup) params.set("groupId", selectedGroup);
      if (selectedSection) params.set("sectionId", selectedSection);
      if (selectedSubSection) params.set("subSection", selectedSubSection);
      if (selectedStaff) params.set("staffId", selectedStaff);
      if (selectedDate) params.set("activationDate", selectedDate);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/students/export?${params.toString()}`);
      if (!res.ok) {
        throw new Error("فشل تصدير ملف إكسيل للطلاب المفعلين");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BATU_Activated_Students_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setFeedback({
        message: "تم تصدير كشف الطلاب المفعلين للبصمة فقط بنجاح بصيغة Excel (الاسم، الرقم الأكاديمي، المجموعة، السكشن، الرقم القومي)!",
        type: "success",
      });
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ أثناء تصدير شيت إكسيل الطلاب المفعلين", type: "error" });
    } finally {
      setExportActivatedLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, selectedGroup, selectedSection, selectedSubSection, activationFilter, selectedStaff, selectedDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchStudents();
  };

  const handleActivate = async (studentId: string, studentName: string) => {
    try {
      setActionLoading(studentId);
      setFeedback(null);

      const res = await fetch("/api/admin/students/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          notes: "تم التفعيل المباشر من كشف الطلاب",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل تفعيل البصمة", type: "error" });
        return;
      }

      setFeedback({
        message: `تم تفعيل بصمة الطالب "${studentName}" بنجاح وإرسال إشعار التهنئة والاعتماد على التيليجرام!`,
        type: "success",
      });
      await fetchStudents();
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeActivation = async (studentId: string, studentName: string) => {
    if (
      !confirm(
        `هل أنت متأكد من إلغاء اعتماد بصمة الطالب "${studentName}" وإعادة إتاحة الحجز له من جديد كأنه لم يقم بالحجز؟`
      )
    ) {
      return;
    }

    try {
      setActionLoading(studentId);
      setFeedback(null);

      const res = await fetch("/api/admin/students/revoke-activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          reason: "إلغاء البصمة وإعادة فتح الحجز بطلب من المشرف",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل إلغاء البصمة", type: "error" });
        return;
      }

      setFeedback({
        message: `تم إلغاء بصمة الطالب "${studentName}" بنجاح، وأصبح بإمكانه الآن حجز دور جديد كأنه لم يقم بالحجز!`,
        type: "success",
      });
      await fetchStudents();
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (
      !confirm(
        `تحذير: هل أنت متأكد من حذف الطالب "${studentName}" نهائياً من دليل الطلاب؟\nسيتم حذف جميع سجلاته وتفعيلاته وحجوزاته من النظام ولا يمكن التراجع عن هذه الخطوة.`
      )
    ) {
      return;
    }

    try {
      setActionLoading(studentId);
      setFeedback(null);

      const res = await fetch(`/api/students/${studentId}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل حذف الطالب", type: "error" });
        return;
      }

      setFeedback({
        message: `تم حذف الطالب "${studentName}" بنجاح وإلغاء تسجيله من دليل الطلاب.`,
        type: "success",
      });
      setSelectedStudentIds((prev) => prev.filter((id) => id !== studentId));
      await fetchStudents();
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع أثناء الحذف", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedStudentIds.length === 0) return;

    if (
      !confirm(
        `تحذير شديد الأهمية:\nهل أنت متأكد من حذف جميع الطلاب المحددين (${selectedStudentIds.length} طلاب) نهائياً من دليل الطلاب؟\nسيتم مسح جميع بياناتهم وحجوزاتهم وسجلات البصمة من قاعدة البيانات بالكامل.`
      )
    ) {
      return;
    }

    try {
      setBulkDeleteLoading(true);
      setFeedback(null);

      const res = await fetch("/api/students/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds: selectedStudentIds }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل تنفيذ الحذف المجمّع", type: "error" });
        return;
      }

      setFeedback({
        message: json.message || `تم حذف (${selectedStudentIds.length}) طالب بنجاح.`,
        type: "success",
      });
      setSelectedStudentIds([]);
      await fetchStudents();
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ أثناء الحذف المجمّع", type: "error" });
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllStudents = () => {
    if (selectedStudentIds.length === students.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(students.map((s) => s.id));
    }
  };

  const allSelected = students.length > 0 && selectedStudentIds.length === students.length;
  const isIndeterminate = selectedStudentIds.length > 0 && selectedStudentIds.length < students.length;

  const handleCopyNationalId = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Open modal for brand new student
  const handleOpenNewStudentModal = () => {
    setConflictData(null);
    const defaultGroup = groups[0]?.id || "";
    setManualForm({
      fullName: "",
      nationalId: "",
      academicNumber: "",
      groupId: defaultGroup,
      sectionId: "",
      subSection: "A",
      isFingerprintActivated: false,
    });
    setIsManualModalOpen(true);
  };

  // Open modal prefilled with existing student data for edit
  const handleOpenEditStudentModal = (student: any) => {
    setConflictData(null);
    setManualForm({
      fullName: student.fullName || "",
      nationalId: student.nationalId || "",
      academicNumber: student.academicNumber || "",
      groupId: student.groupId || groups[0]?.id || "",
      sectionId: student.sectionId || "",
      subSection: student.subSection || "A",
      isFingerprintActivated: Boolean(student.isFingerprintActivated || student.isActivated),
    });
    setIsManualModalOpen(true);
  };

  // Submit manual form (either initial check or with overwrite approved)
  const handleManualSubmit = async (overwrite = false) => {
    try {
      setManualLoading(true);
      setFeedback(null);

      const res = await fetch("/api/admin/students/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...manualForm,
          overwrite,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل تسجيل بيانات الطالب", type: "error" });
        return;
      }

      // If backend detected an existing student conflict and we didn't send overwrite:
      if (json.data?.conflict) {
        setConflictData(json.data);
        return;
      }

      // Successful insert or overwrite
      setFeedback({
        message: json.message || "تم حفظ وتحديث بيانات الطالب بنجاح!",
        type: "success",
      });
      setIsManualModalOpen(false);
      setConflictData(null);
      await fetchStudents();
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setManualLoading(false);
    }
  };

  const activationPercentage = stats.totalRegistered > 0
    ? Math.round((stats.totalActivated / stats.totalRegistered) * 100)
    : 0;

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-[#0d1627] to-slate-900 border border-slate-800 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono font-bold tracking-wider">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>CENTRAL BIOMETRICS DIRECTORY • سجل البصمة المركزي</span>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight flex items-center gap-3">
              <span>دليل الطلاب وسجل حالة البصمة</span>
              <Sparkles className="w-6 h-6 text-amber-400 hidden sm:inline-block" />
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              السجل الرسمي المعتمد لجميع طلاب الفرقة الثانية، يتيح استعراض حالة بصمة الوجه، التفعيل أو الإلغاء، التصدير، وإدخال أو استبدال بيانات الطلاب يدوياً.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {isSuperAdmin && (
              <button
                onClick={handleOpenNewStudentModal}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition transform active:scale-95 flex items-center gap-2"
                title="إدخال بيانات طالب جديد أو استبدال بيانات طالب مسجل يدوياً"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة طالب يدوياً</span>
              </button>
            )}

            {/* Export Activated Students Only (Special Request) */}
            <button
              onClick={handleExportActivatedExcel}
              disabled={exportActivatedLoading}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 disabled:opacity-50 active:scale-95 border border-emerald-400/30"
              title="تصدير شيت إكسيل خاص للطلاب أصحاب البصمة المفعلة فقط (الاسم، الرقم الأكاديمي، المجموعة، السكشن، الرقم القومي)"
            >
              <CheckCircle2 className={`w-4 h-4 text-emerald-200 ${exportActivatedLoading ? "animate-spin" : ""}`} />
              <span>{exportActivatedLoading ? "جاري تجهيز الكشف..." : "تصدير كشف المفعلين فقط (Excel)"}</span>
            </button>

            {/* Export Full Directory */}
            <button
              onClick={handleExportExcel}
              disabled={exportLoading}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 text-xs font-bold border border-slate-700 shadow-md transition flex items-center gap-2 disabled:opacity-50"
              title="تصدير كشف الطلاب كاملاً مع الأرقام القومية والأكاديمية لشيت Excel"
            >
              <FileSpreadsheet className={`w-4 h-4 text-teal-400 ${exportLoading ? "animate-bounce" : ""}`} />
              <span>{exportLoading ? "جاري التصدير..." : "الكشف الشامل"}</span>
            </button>

            <button
              onClick={() => fetchStudents()}
              disabled={loading}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-bold border border-slate-700 shadow-md transition flex items-center gap-2"
              title="تحديث البيانات الآن"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Message */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-sm font-semibold flex items-center justify-between shadow-xl transition-all ${
            feedback.type === "success"
              ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-200"
              : "bg-red-950/60 border-red-500/50 text-red-200"
          }`}
        >
          <div className="flex items-center gap-3">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold px-2 py-1 rounded-lg bg-black/20 hover:bg-black/40 text-slate-300 hover:text-white"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Operational Protocol Notice */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 text-xs text-slate-300 backdrop-blur-md">
        <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="leading-relaxed">
          {isSuperAdmin ? (
            <>
              <span className="font-bold text-white">صلاحيات كاملة للمشرف العام (Super Admin):</span> يمكنك{" "}
              <b className="text-emerald-400">تفعيل البصمة</b> مباشرة لأي طالب لاعتمادها فوراً، أو{" "}
              <b className="text-amber-400">إلغاء البصمة وإعادة فتح الحجز</b> للبدء من جديد، أو{" "}
              <b className="text-blue-400">إدخال واستبدال بيانات الطلاب يدوياً</b> مع مراجعة التعارض قبل الاعتماد.
            </>
          ) : (
            <>
              <span className="font-bold text-white">سجل حالة البصمة (صلاحية استعراض):</span> يمكنك تصفح بيانات الطلاب والتصفية وتصدير كشوف الإكسيل. إجراءات التفعيل والإلغاء وتعديل البيانات مقتصرة على المشرف العام.
            </>
          )}
        </div>
      </div>

      {/* Auth Error Banner if logged out */}
      {authError && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-3xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-base font-bold text-white">انتهت جلسة تسجيل الدخول أو يلزم تسجيل دخول المشرف</h3>
          <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            سجلات الطلاب مشفرة ومحمية بصلاحيات المشرف العام. يرجى تسجيل الدخول بحساب المشرف لتتمكن من استعراض كشف الطلاب.
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30"
            >
              <LogIn className="w-4 h-4" />
              <span>تسجيل الدخول الآن بحساب المشرف</span>
            </Link>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 hover:border-blue-500/40 rounded-2xl p-5 shadow-xl transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">إجمالي المقيدين بالدليل</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-white font-mono">
            {stats.totalRegistered.toLocaleString()}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>طلاب الفرقة الثانية المقيدين</span>
          </div>
        </div>

        {/* Total Biometrics Activated */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/20 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-5 shadow-xl transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">تمت البصمة (موثقين)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400 font-mono">
              {stats.totalActivated.toLocaleString()}
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              {activationPercentage}%
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>تم تفعيل بصمة الوجه بنجاح</span>
          </div>
        </div>

        {/* Total Not Activated */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-5 shadow-xl transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">قيد الانتظار (لم تبصم)</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-amber-400 font-mono">
            {stats.totalNotActivated.toLocaleString()}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-400/90 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>بانتظار توثيق وتفعيل البصمة</span>
          </div>
        </div>

        {/* Filter-specific Counter (Staff and/or Date) */}
        <div
          className={`border rounded-2xl p-5 shadow-xl transition-all relative overflow-hidden ${
            selectedStaff || selectedDate
              ? "bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-950 border-purple-500/40 ring-1 ring-purple-500/30"
              : "bg-slate-900 border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              {selectedStaff && selectedDate
                ? "تفعيل الموظف بالتاريخ"
                : selectedStaff
                ? "إجمالي تفعيل الموظف"
                : selectedDate
                ? "إجمالي التفعيل بالتاريخ"
                : "تخصيص الفرز (موظف / تاريخ)"}
            </span>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                selectedStaff || selectedDate
                  ? "bg-purple-500/20 border border-purple-500/40 text-purple-300"
                  : "bg-slate-800 border border-slate-700 text-slate-500"
              }`}
            >
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black font-mono text-purple-300">
            {selectedStaff || selectedDate
              ? (stats.filteredStaffDateCount ?? 0).toLocaleString()
              : "—"}
          </div>
          <div className="mt-2 text-[11px] text-purple-300/80 font-medium truncate">
            {selectedStaff || selectedDate
              ? `${
                  selectedStaff
                    ? staffList.find((s) => s.id === selectedStaff)?.fullName || "الموظف"
                    : "كل الموظفين"
                } ${selectedDate ? `• يوم ${selectedDate}` : ""}`
              : "اختر موظفاً أو تاريخاً من الفلتر"}
          </div>
        </div>
      </div>

      {/* Search & Advanced Filters Master Hub */}
      <div className="bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 rounded-3xl border border-slate-800 shadow-2xl p-5 sm:p-7 space-y-6 backdrop-blur-2xl">
        
        {/* Hub Header & Status Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  أدوات التصفية والبحث المتقدم
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20">
                  فرز فوري
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                تصفية الطلاب حسب الأبعاد الأكاديمية وحالة البصمة والتوثيق مع شريط بحث فوري وموسع
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Filter Status Tabs */}
            <div className="flex rounded-xl bg-slate-950/80 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActivationFilter("");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activationFilter === ""
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>الكل ({stats.totalRegistered})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActivationFilter("ACTIVATED");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activationFilter === "ACTIVATED"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>تمت البصمة ({stats.totalActivated})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActivationFilter("NOT_ACTIVATED");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activationFilter === "NOT_ACTIVATED"
                    ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>لم تبصم بعد ({stats.totalNotActivated})</span>
              </button>
            </div>

            {/* Reset All Button */}
            {(selectedGroup ||
              selectedSection ||
              selectedSubSection ||
              activationFilter ||
              selectedStaff ||
              selectedDate ||
              search) && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                title="إعادة ضبط جميع الفلاتر وحقول البحث"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إلغاء كل الفلاتر</span>
              </button>
            )}
          </div>
        </div>

        {/* Big Prominent Search Bar (البحث الموسع) */}
        <div className="space-y-2">
          <form
            onSubmit={handleSearchSubmit}
            className="relative flex flex-col sm:flex-row items-stretch gap-2.5 p-2 rounded-2xl bg-slate-950/90 border border-slate-700/80 shadow-xl focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all"
          >
            <div className="flex-1 flex items-center gap-3 px-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0 shadow-inner">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم الكامل للطالب، أو الرقم الأكاديمي، أو الرقم القومي..."
                className="w-full bg-transparent text-sm sm:text-base text-white placeholder-slate-400 focus:outline-none font-medium py-2"
              />
              {search && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition flex-shrink-0"
                  title="مسح نص البحث"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-7 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 flex-shrink-0 active:scale-95 disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
              <span>بحث في السجلات</span>
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-2 flex-wrap gap-2">
            <span>
              💡 يمكنك كتابة جزء من اسم الطالب، رقمه الجامعي، أو بطاقة الرقم القومي ثم الضغط على زر البحث أو Enter.
            </span>
            {search && (
              <span className="text-blue-400 font-bold font-mono">
                نتائج مطابقة للبحث: &quot;{search}&quot;
              </span>
            )}
          </div>
        </div>

        {/* Distributed Filter Sections (موزعة ومريحة للعين) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* Section 1: Academic Dimensions */}
          <div className="bg-slate-950/50 border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-md">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 pb-2 border-b border-slate-800/70">
              <Folder className="w-4 h-4 text-indigo-400" />
              <span>الأبعاد الأكاديمية والتسكين الدراسي</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Group */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>المجموعة الدراسية:</span>
                </label>
                <select
                  value={selectedGroup}
                  onChange={(e) => {
                    setSelectedGroup(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700/80 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-900 text-white transition hover:border-slate-600"
                >
                  <option value="">جميع المجموعات</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>السكشن:</span>
                </label>
                <select
                  value={selectedSection}
                  onChange={(e) => {
                    setSelectedSection(e.target.value);
                    setPage(1);
                  }}
                  disabled={!selectedGroup || sections.length === 0}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700/80 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-900 text-white disabled:opacity-40 transition hover:border-slate-600"
                >
                  <option value="">جميع السكاشن</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sub-Section */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>القسم الفرعي:</span>
                </label>
                <select
                  value={selectedSubSection}
                  onChange={(e) => {
                    setSelectedSubSection(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700/80 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-900 text-white transition hover:border-slate-600"
                >
                  <option value="">جميع الأقسام (A و B)</option>
                  <option value="A">قسم A فقط</option>
                  <option value="B">قسم B فقط</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Biometrics & Audit Tracking */}
          <div className="bg-slate-950/50 border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-md">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 pb-2 border-b border-slate-800/70">
              <Fingerprint className="w-4 h-4 text-emerald-400" />
              <span>محددات البصمة والاعتماد المكتبي</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Activation Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>حالة تفعيل البصمة:</span>
                </label>
                <select
                  value={activationFilter}
                  onChange={(e) => {
                    setActivationFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700/80 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-900 text-white transition hover:border-slate-600"
                >
                  <option value="">جميع الحالات</option>
                  <option value="ACTIVATED">تمت البصمة (مفعل)</option>
                  <option value="NOT_ACTIVATED">لم تفعل بعد (انتظار)</option>
                </select>
              </div>

              {/* Staff Member */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>الموظف الموثّق:</span>
                </label>
                <select
                  value={selectedStaff}
                  onChange={(e) => {
                    setSelectedStaff(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700/80 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-900 text-white transition hover:border-slate-600"
                >
                  <option value="">جميع الموظفين</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.role === "SUPER_ADMIN" ? "مشرف عام" : "موظف بصمة"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>تاريخ التوثيق:</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setPage(1);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700/80 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-900 text-white transition hover:border-slate-600"
                  />
                  {selectedDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate("");
                        setPage(1);
                      }}
                      className="absolute left-2.5 top-2.5 text-slate-400 hover:text-white"
                      title="مسح التاريخ"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Active Filter Chips Bar */}
        {(selectedGroup ||
          selectedSection ||
          selectedSubSection ||
          activationFilter ||
          selectedStaff ||
          selectedDate ||
          search) && (
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-blue-400" />
                <span>الفلاتر النشطة:</span>
              </span>

              {search && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-medium">
                  <span>بحث: &quot;{search}&quot;</span>
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedGroup && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
                  <span>المجموعة: {groups.find((g) => g.id === selectedGroup)?.name || selectedGroup}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroup("");
                      setSelectedSection("");
                      setPage(1);
                    }}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedSection && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
                  <span>السكشن: {sections.find((s) => s.id === selectedSection)?.name || selectedSection}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSection("");
                      setPage(1);
                    }}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedSubSection && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
                  <span>القسم الفرعي: {selectedSubSection}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubSection("");
                      setPage(1);
                    }}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {activationFilter && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                  activationFilter === "ACTIVATED"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                }`}>
                  <span>
                    {activationFilter === "ACTIVATED" ? "تمت البصمة (مفعل)" : "لم تبصم بعد (انتظار)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActivationFilter("");
                      setPage(1);
                    }}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedStaff && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium">
                  <span>الموظف: {staffList.find((s) => s.id === selectedStaff)?.fullName || selectedStaff}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStaff("");
                      setPage(1);
                    }}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedDate && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-medium">
                  <span>التاريخ: {selectedDate}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate("");
                      setPage(1);
                    }}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            <div className="text-xs text-slate-400 font-medium">
              إجمالي النتائج الحالية: <b className="text-white font-mono">{total}</b> طالب
            </div>
          </div>
        )}
      </div>

      {/* Bulk Action Toolbar for Students - Super Admin Only */}
      {isSuperAdmin && selectedStudentIds.length > 0 && (
        <div className="bg-gradient-to-r from-red-950/80 via-slate-900 to-slate-950 border border-red-500/40 rounded-2xl p-4 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/30 border border-red-400/40 flex items-center justify-center text-red-300 font-bold text-sm font-mono">
              {selectedStudentIds.length}
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                تم تحديد ({selectedStudentIds.length}) من أصل ({students.length}) طالب في الصفحة الحالية
              </div>
              <div className="text-xs text-red-300">
                يمكنك حذف وإلغاء تسجيل الطلاب المحددين دفعة واحدة من المنظومة:
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleteLoading}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-red-600/30 disabled:opacity-50"
              title="حذف جميع الطلاب المحددين نهائياً من قاعدة البيانات"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{bulkDeleteLoading ? "جاري الحذف..." : `حذف الطلاب المحددين (${selectedStudentIds.length})`}</span>
            </button>

            <button
              onClick={() => setSelectedStudentIds([])}
              disabled={bulkDeleteLoading}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>إلغاء التحديد</span>
            </button>
          </div>
        </div>
      )}

      {/* Students Data Table */}
      <div className="bg-slate-900/90 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-20 text-center text-slate-400 text-sm space-y-4">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-semibold text-slate-300">جاري استرجاع وفك تشفير سجلات كشف الطلاب...</p>
          </div>
        ) : authError ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            يرجى تسجيل الدخول بحساب المشرف لعرض محتويات الجدول.
          </div>
        ) : students.length === 0 ? (
          <div className="p-20 text-center text-slate-400 text-sm space-y-3">
            <Users className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="font-bold text-slate-300">لا توجد سجلات طلاب تطابق خيارات التصفية الحالية.</p>
            <p className="text-xs text-slate-500">جرب تغيير الفلاتر أو البحث باسم أو رقم آخر.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-[#090d18] border-b border-slate-800/90 text-slate-400 text-xs font-bold tracking-wide">
                  {isSuperAdmin && (
                    <th className="p-4 w-12 text-center">
                      <button
                        onClick={handleSelectAllStudents}
                        className="p-1 rounded text-slate-400 hover:text-white transition"
                        title={allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                      >
                        {allSelected ? (
                          <CheckSquare className="w-4 h-4 text-red-400" />
                        ) : isIndeterminate ? (
                          <div className="w-4 h-4 rounded border-2 border-red-400 flex items-center justify-center bg-red-500/20">
                            <div className="w-2 h-0.5 bg-red-400" />
                          </div>
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                  )}
                  <th className="p-4">اسم الطالب</th>
                  <th className="p-4">الرقم القومي</th>
                  <th className="p-4">الرقم الأكاديمي</th>
                  <th className="p-4">المجموعة والسكشن</th>
                  <th className="p-4">القسم</th>
                  <th className="p-4">التيليجرام</th>
                  <th className="p-4">حالة البصمة</th>
                  <th className="p-4">بيانات التوثيق</th>
                  <th className="p-4 text-center">
                    {isSuperAdmin ? "إجراءات التحكم والتعديل" : "حالة السجل"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {students.map((student) => {
                  const isDone = Boolean(student.isFingerprintActivated || student.isActivated);
                  const staffName = student.activatedByName || student.activatedByStaffName;
                  const isSelected = selectedStudentIds.includes(student.id);

                  // Extract initial letter for avatar
                  const initial = student.fullName?.trim()?.charAt(0) || "ط";

                  return (
                    <tr
                      key={student.id}
                      className={`transition-colors ${
                        isSelected
                          ? "bg-red-950/20"
                          : "hover:bg-slate-800/35"
                      }`}
                    >
                      {/* Checkbox - Super Admin Only */}
                      {isSuperAdmin && (
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleToggleSelectStudent(student.id)}
                            className="p-1 rounded text-slate-400 hover:text-white transition"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-red-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      )}

                      {/* Student Name & Avatar */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                            isDone
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                              : "bg-blue-500/10 text-blue-300 border border-blue-500/20"
                          }`}>
                            {initial}
                          </div>
                          <div>
                            <div className="font-bold text-white text-sm leading-tight">
                              {student.fullName}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              قيد: {formatCairoDateTime(student.createdAt).split(" ")[0]}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Decrypted 14-digit National ID with copy */}
                      <td className="p-4 font-mono font-bold text-slate-200">
                        <div className="inline-flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 text-xs tracking-wider">
                          <span>{student.nationalId}</span>
                          <button
                            onClick={() => handleCopyNationalId(student.id, student.nationalId)}
                            className="text-slate-500 hover:text-slate-200 transition"
                            title="نسخ الرقم القومي"
                          >
                            {copiedId === student.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Academic Number */}
                      <td className="p-4 font-mono text-slate-300 text-xs font-semibold">
                        <span className="bg-slate-950/40 px-2 py-0.5 rounded border border-slate-800/80">
                          {student.academicNumber}
                        </span>
                      </td>

                      {/* Group & Section */}
                      <td className="p-4 text-xs">
                        <div className="font-bold text-slate-200">{student.groupName}</div>
                        <div className="text-slate-400 text-[11px] mt-0.5">{student.sectionName}</div>
                      </td>

                      {/* Sub-Section */}
                      <td className="p-4 text-xs">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            student.subSection === "B"
                              ? "bg-purple-950/50 text-purple-300 border-purple-800/50"
                              : "bg-blue-950/50 text-blue-300 border-blue-800/50"
                          }`}
                        >
                          قسم {student.subSection || "A"}
                        </span>
                      </td>

                      {/* Telegram Status */}
                      <td className="p-4 text-xs">
                        {student.hasTelegram || student.telegramUserId ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 bg-cyan-950/40 px-2.5 py-0.5 rounded-full border border-cyan-800/50">
                            <Send className="w-3 h-3" />
                            <span>@{student.telegramUsername || "مرتبط"}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">غير مرتبط</span>
                        )}
                      </td>

                      {/* Fingerprint Status Badge */}
                      <td className="p-4">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/10">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>تمت البصمة</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span>لم تفعل بعد</span>
                          </span>
                        )}
                      </td>

                      {/* Activated By Staff Details */}
                      <td className="p-4 text-xs">
                        {isDone ? (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-slate-200 flex items-center gap-1">
                              <span className="text-slate-400 text-[10px]">بواسطة:</span>
                              <span className="text-emerald-300 font-bold">{staffName || "المشرف المعتمد"}</span>
                            </div>
                            {student.activatedAt && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {formatCairoDateTime(student.activatedAt)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">قيد انتظار الدور</span>
                        )}
                      </td>

                      {/* Actions: Direct Activation / Revoke Activation / Edit / Delete */}
                      <td className="p-4 text-center">
                        {isSuperAdmin ? (
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {isDone ? (
                              <button
                                onClick={() => handleRevokeActivation(student.id, student.fullName)}
                                disabled={actionLoading === student.id}
                                title="إلغاء اعتماد البصمة وإلغاء الدور ليتمكن الطالب من حجز دور جديد من البداية"
                                className="px-2.5 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${actionLoading === student.id ? "animate-spin" : ""}`} />
                                <span>إلغاء البصمة</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivate(student.id, student.fullName)}
                                disabled={actionLoading === student.id}
                                title="تفعيل بصمة الوجه للطالب واعتمادها الآن وإرسال رسالة التهنئة على التيليجرام"
                                className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm flex items-center gap-1 disabled:opacity-50"
                              >
                                <UserCheck className={`w-3.5 h-3.5 ${actionLoading === student.id ? "animate-spin" : ""}`} />
                                <span>تفعيل البصمة</span>
                              </button>
                            )}

                            {/* Edit / Overwrite Student Button */}
                            <button
                              onClick={() => handleOpenEditStudentModal(student)}
                              title="تعديل أو استبدال بيانات الطالب"
                              className="p-1.5 rounded-xl bg-blue-950/40 hover:bg-blue-900/60 text-blue-400 border border-blue-800/40 transition hover:text-blue-200"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Student Button */}
                            <button
                              onClick={() => handleDeleteStudent(student.id, student.fullName)}
                              disabled={actionLoading === student.id}
                              title="حذف الطالب وإلغاء تسجيله نهائياً من دليل الطلاب"
                              className="p-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 transition hover:text-red-200 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium px-2.5 py-1 bg-slate-950/60 rounded-xl border border-slate-800">
                            صلاحية استعراض فقط
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 25 && (
          <div className="p-4 border-t border-slate-800/80 bg-[#090d18] flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">
              عرض {(page - 1) * 25 + 1} - {Math.min(page * 25, total)} من أصل {total} طالب
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-40 flex items-center gap-1 font-bold hover:bg-slate-800 transition"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>السابق</span>
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 25 >= total}
                className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-40 flex items-center gap-1 font-bold hover:bg-slate-800 transition"
              >
                <span>التالي</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Student Entry / Overwrite Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">إدخال / تحديث بيانات طالب يدوياً</h3>
                  <p className="text-xs text-slate-400">إدخال مباشر لبيانات الطالب بواسطة المشرف مع معالجة التعارض</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsManualModalOpen(false);
                  setConflictData(null);
                }}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* CONFLICT DETECTED VIEW (زر أوافق على استبدال البيانات) */}
            {conflictData ? (
              <div className="space-y-5 animate-fade-in">
                <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-black text-amber-300 text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <span>تنبيه: الطالب مسجل بالفعل مسبقاً في المنظومة!</span>
                  </div>
                  <p className="leading-relaxed">
                    تم العثور على سجل مسبق يتطابق مع الرقم الأكاديمي أو الرقم القومي المدخل. يمكنك مراجعة الفروقات بالأسفل واختيار استبدال البيانات الحالية بالبيانات الجديدة.
                  </p>
                </div>

                {/* Side-by-Side Comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Existing Student Data */}
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                    <div className="font-bold text-slate-400 pb-1.5 border-b border-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      <span>البيانات الحالية بالمنظومة:</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">الاسم:</span>
                      <span className="font-bold text-white text-sm">{conflictData.existingStudent.fullName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">الرقم القومي:</span>
                      <span className="font-mono text-slate-300">{conflictData.existingStudent.nationalId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">الرقم الأكاديمي:</span>
                      <span className="font-mono text-slate-300">{conflictData.existingStudent.academicNumber}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">المجموعة والسكشن:</span>
                      <span className="text-slate-300">
                        {conflictData.existingStudent.groupName} • {conflictData.existingStudent.sectionName} (قسم {conflictData.existingStudent.subSection})
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">حالة البصمة:</span>
                      <span className={conflictData.existingStudent.isActivated ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                        {conflictData.existingStudent.isActivated ? "مفعلة رسمياً" : "غير مفعلة"}
                      </span>
                    </div>
                  </div>

                  {/* New Data To Replace */}
                  <div className="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/30 space-y-2.5">
                    <div className="font-bold text-blue-300 pb-1.5 border-b border-blue-500/20 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      <span>البيانات الجديدة المراد استبدالها:</span>
                    </div>
                    <div>
                      <span className="text-blue-400/80 block">الاسم الجديد:</span>
                      <span className="font-bold text-white text-sm">{conflictData.newData.fullName}</span>
                    </div>
                    <div>
                      <span className="text-blue-400/80 block">الرقم القومي الجديد:</span>
                      <span className="font-mono text-blue-200">{conflictData.newData.nationalId}</span>
                    </div>
                    <div>
                      <span className="text-blue-400/80 block">الرقم الأكاديمي الجديد:</span>
                      <span className="font-mono text-blue-200">{conflictData.newData.academicNumber}</span>
                    </div>
                    <div>
                      <span className="text-blue-400/80 block">المجموعة والسكشن:</span>
                      <span className="text-blue-200">
                        {conflictData.newData.groupName} • {conflictData.newData.sectionName} (قسم {conflictData.newData.subSection})
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-400/80 block">تفعيل البصمة:</span>
                      <span className={conflictData.newData.isFingerprintActivated ? "text-emerald-400 font-bold" : "text-slate-400 font-bold"}>
                        {conflictData.newData.isFingerprintActivated ? "تفعيل واعتماد مباشر" : "بدون تفعيل مباشر"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Overwrite Confirmation Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleManualSubmit(true)}
                    disabled={manualLoading}
                    className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 via-emerald-600 to-teal-600 hover:from-amber-500 hover:to-teal-500 text-white font-bold text-sm shadow-xl shadow-emerald-900/30 transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{manualLoading ? "جاري الاستبدال..." : "أوافق على استبدال وتحديث البيانات"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConflictData(null)}
                    disabled={manualLoading}
                    className="w-full sm:w-auto py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition"
                  >
                    تعديل البيانات المدخلة
                  </button>
                </div>
              </div>
            ) : (
              /* STANDARD MANUAL FORM */
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleManualSubmit(false);
                }}
                className="space-y-4 text-xs font-semibold"
              >
                {/* Full Name */}
                <div>
                  <label className="block text-slate-300 mb-1">اسم الطالب رباعي بالكامل *</label>
                  <input
                    type="text"
                    required
                    value={manualForm.fullName}
                    onChange={(e) => setManualForm({ ...manualForm, fullName: e.target.value })}
                    placeholder="مثال: أحمد محمد علي حسن"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* National ID & Academic Number */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">الرقم القومي (14 رقم) *</label>
                    <input
                      type="text"
                      required
                      maxLength={14}
                      value={manualForm.nationalId}
                      onChange={(e) => setManualForm({ ...manualForm, nationalId: e.target.value })}
                      placeholder="14 رقماً"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1">الرقم الأكاديمي *</label>
                    <input
                      type="text"
                      required
                      value={manualForm.academicNumber}
                      onChange={(e) => setManualForm({ ...manualForm, academicNumber: e.target.value })}
                      placeholder="مثال: 2520111"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Group & Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1">المجموعة الدراسية *</label>
                    <select
                      required
                      value={manualForm.groupId}
                      onChange={(e) => setManualForm({ ...manualForm, groupId: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">اختر المجموعة...</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1">السكشن *</label>
                    <select
                      required
                      value={manualForm.sectionId}
                      onChange={(e) => setManualForm({ ...manualForm, sectionId: e.target.value })}
                      disabled={!manualForm.groupId || manualSections.length === 0}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                    >
                      <option value="">اختر السكشن...</option>
                      {manualSections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* SubSection & Biometric Option */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-1">
                  <div>
                    <label className="block text-slate-300 mb-1">القسم الفرعي *</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setManualForm({ ...manualForm, subSection: "A" })}
                        className={`flex-1 py-2 rounded-xl font-bold border transition ${
                          manualForm.subSection === "A"
                            ? "bg-blue-600 text-white border-blue-500"
                            : "bg-slate-950 text-slate-400 border-slate-800"
                        }`}
                      >
                        قسم A
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualForm({ ...manualForm, subSection: "B" })}
                        className={`flex-1 py-2 rounded-xl font-bold border transition ${
                          manualForm.subSection === "B"
                            ? "bg-purple-600 text-white border-purple-500"
                            : "bg-slate-950 text-slate-400 border-slate-800"
                        }`}
                      >
                        قسم B
                      </button>
                    </div>
                  </div>

                  {/* Fingerprint immediate activation checkbox */}
                  <div className="pt-4 sm:pt-6">
                    <label className="flex items-center gap-2.5 cursor-pointer bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 hover:border-slate-700 transition">
                      <input
                        type="checkbox"
                        checked={manualForm.isFingerprintActivated}
                        onChange={(e) => setManualForm({ ...manualForm, isFingerprintActivated: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-900"
                      />
                      <span className="text-slate-200 text-xs">
                        تفعيل واعتماد بصمة الوجه فورياً
                      </span>
                    </label>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition text-xs"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    disabled={manualLoading}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-blue-600/30 transition text-xs flex items-center gap-2 disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{manualLoading ? "جاري الفحص والحفظ..." : "حفظ بيانات الطالب"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
