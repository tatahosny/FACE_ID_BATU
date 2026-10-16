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
} from "lucide-react";

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

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

  // Load sections when group changes
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

  const fetchStudents = async () => {
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
      if (search) params.set("search", search);

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-xs font-mono text-blue-400 font-bold uppercase tracking-wider">
              STUDENT REPOSITORY • كشف الطلاب المركزي
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            دليل الطلاب وسجل حالة البصمة
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            كشف معتمد لجميع الطلاب المسجلين بالفرقة الثانية، مع إمكانية التفعيل المباشر للبصمة أو إلغائها وإعادة فتح الحجز (إجمالي المسجلين: {total} طالب).
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <button
            onClick={handleExportExcel}
            disabled={exportLoading}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition flex items-center gap-2 disabled:opacity-50"
            title="تصدير كشف الطلاب الحالي كاملاً مع الأرقام القومية والأكاديمية والسكاشن لشيت Excel"
          >
            <FileSpreadsheet className={`w-4 h-4 ${exportLoading ? "animate-bounce" : ""}`} />
            <span>{exportLoading ? "جاري تجهيز الشيت..." : "تصدير شيت إكسيل (Excel)"}</span>
          </button>
          <button
            onClick={fetchStudents}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold border border-slate-700 shadow-md transition flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
            <span>تحديث القائمة</span>
          </button>
        </div>
      </div>

      {/* Feedback Message */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-sm font-medium flex items-center justify-between animate-fade-in ${
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

      {/* Operational Protocol Notice */}
      <div className="bg-blue-950/30 border border-blue-900/40 rounded-2xl p-4 flex items-center gap-3 text-xs text-blue-300">
        <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0" />
        <div>
          {isSuperAdmin ? (
            <>
              <span className="font-bold">تحكم ثنائي الاتجاه بالبصمة:</span> يمكنك <b>تفعيل البصمة</b> مباشرة لأي طالب غير مفعل ليتم توثيقه وإرسال إشعار التيليجرام له، أو <b>إلغاء البصمة وإعادة الحجز</b> لأي طالب مفعل ليتمكن من حجز دور جديد من الصفر.
            </>
          ) : (
            <>
              <span className="font-bold">سجل حالة البصمة (صلاحية استعراض فقط):</span> يمكنك تصفح بيانات الطلاب والتصفية وتصدير كشوف الإكسيل. إجراءات تفعيل وإلغاء واعتماد البصمة وحذف الطلاب مقتصرة حصرياً على المشرف العام (Super Admin).
            </>
          )}
        </div>
      </div>

      {/* Auth Error Banner if logged out */}
      {authError && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-base font-bold text-white">انتهت جلسة تسجيل الدخول أو يلزم تسجيل دخول المشرف</h3>
          <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            سجلات الطلاب مشفرة ومحمية بصلاحيات المشرف العام. يرجى تسجيل الدخول بحساب المشرف (admin@batu.edu.eg) لتتمكن من استعراض كشف الطلاب.
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
        <div className="bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-900 border border-blue-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">إجمالي الطلاب المسجلين</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-white font-mono">
            {stats.totalRegistered.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-blue-400 font-medium">
            طالب مقيد بالمنظومة المركزية
          </div>
        </div>

        {/* Total Biometrics Activated */}
        <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">البصمة مفعلة (تم التوثيق)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-emerald-400 font-mono">
            {stats.totalActivated.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-emerald-400/80 font-medium">
            طالب تم تفعيل بصمة الوجه لهم بنجاح
          </div>
        </div>

        {/* Total Not Activated */}
        <div className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">غير المفعلين (قيد الانتظار)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-amber-400 font-mono">
            {stats.totalNotActivated.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-amber-400/80 font-medium">
            طالب بانتظار توثيق وتفعيل البصمة
          </div>
        </div>

        {/* Filter-specific Counter (Staff and/or Date) */}
        <div
          className={`border rounded-2xl p-4 shadow-xl backdrop-blur-xl relative overflow-hidden transition ${
            selectedStaff || selectedDate
              ? "bg-gradient-to-br from-purple-950/50 via-slate-900 to-slate-900 border-purple-500/40 ring-1 ring-purple-500/30"
              : "bg-slate-900/60 border-slate-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400">
              {selectedStaff && selectedDate
                ? "تفعيل الموظف بالتاريخ المختار"
                : selectedStaff
                ? "إجمالي تفعيل الموظف المختار"
                : selectedDate
                ? "إجمالي التفعيل بالتاريخ المختار"
                : "تخصيص الفرز (موظف / تاريخ)"}
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                selectedStaff || selectedDate
                  ? "bg-purple-500/20 border border-purple-500/40 text-purple-300"
                  : "bg-slate-800 border border-slate-700 text-slate-500"
              }`}
            >
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black font-mono text-purple-300">
            {selectedStaff || selectedDate
              ? (stats.filteredStaffDateCount ?? 0).toLocaleString()
              : "—"}
          </div>
          <div className="mt-1 text-[11px] text-purple-300/80 font-medium truncate">
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

      {/* Filters Bar */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-4 sm:p-5 space-y-4 backdrop-blur-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {/* Group Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">المجموعة:</label>
            <select
              value={selectedGroup}
              onChange={(e) => {
                setSelectedGroup(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-950 text-white"
            >
              <option value="">جميع المجموعات (الكل)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">السكشن:</label>
            <select
              value={selectedSection}
              onChange={(e) => {
                setSelectedSection(e.target.value);
                setPage(1);
              }}
              disabled={!selectedGroup || sections.length === 0}
              className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-950 text-white disabled:opacity-50"
            >
              <option value="">جميع السكاشن (الكل)</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sub-Section Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">القسم الفرعي:</label>
            <select
              value={selectedSubSection}
              onChange={(e) => {
                setSelectedSubSection(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-950 text-white"
            >
              <option value="">جميع الأقسام (A و B)</option>
              <option value="A">قسم A فقط</option>
              <option value="B">قسم B فقط</option>
            </select>
          </div>

          {/* Activation Status Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">حالة البصمة:</label>
            <select
              value={activationFilter}
              onChange={(e) => {
                setActivationFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-950 text-white"
            >
              <option value="">جميع الحالات (الكل)</option>
              <option value="ACTIVATED">تمت البصمة (مفعل رسمياً)</option>
              <option value="NOT_ACTIVATED">لم تفعل بعد (قيد الانتظار)</option>
            </select>
          </div>

          {/* Staff Member Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">الموظف المعتمد للبصمة:</label>
            <select
              value={selectedStaff}
              onChange={(e) => {
                setSelectedStaff(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-950 text-white"
            >
              <option value="">جميع الموظفين (الكل)</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.role === "SUPER_ADMIN" ? "مدير" : "موظف"})
                </option>
              ))}
            </select>
          </div>

          {/* Activation Date Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">تاريخ توثيق البصمة:</label>
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 bg-slate-950 text-white"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate("");
                    setPage(1);
                  }}
                  className="absolute left-2 top-2 text-slate-400 hover:text-white"
                  title="مسح التاريخ"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">بحث سريع:</label>
            <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="اسم أو رقم..."
                className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-950 text-white placeholder-slate-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center gap-1"
                title="تنفيذ البحث"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* Clear Filters Helper */}
        {(selectedGroup ||
          selectedSection ||
          selectedSubSection ||
          activationFilter ||
          selectedStaff ||
          selectedDate ||
          search) && (
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">الفلاتر النشطة تطبق على القائمة حالياً.</span>
            <button
              onClick={() => {
                setSelectedGroup("");
                setSelectedSection("");
                setSelectedSubSection("");
                setActivationFilter("");
                setSelectedStaff("");
                setSelectedDate("");
                setSearch("");
                setPage(1);
              }}
              className="text-blue-400 hover:underline font-bold flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>إلغاء جميع الفلاتر</span>
            </button>
          </div>
        )}
      </div>

      {/* Bulk Action Toolbar for Students - Super Admin Only */}
      {isSuperAdmin && selectedStudentIds.length > 0 && (
        <div className="bg-gradient-to-r from-red-950/80 via-slate-900/90 to-slate-950/90 border border-red-500/40 rounded-2xl p-4 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/30 border border-red-400/40 flex items-center justify-center text-red-300 font-bold text-sm font-mono">
              {selectedStudentIds.length}
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                تم تحديد ({selectedStudentIds.length}) من أصل ({students.length}) طالب في الصفحة الحالية
              </div>
              <div className="text-xs text-red-300">
                يمكنك الآن حذف وإلغاء تسجيل الطلاب المحددين دفعة واحدة من المنظومة:
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
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm space-y-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>جاري استرجاع وفك تشفير سجلات كشف الطلاب...</p>
          </div>
        ) : authError ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            يرجى تسجيل الدخول بحساب المشرف لعرض محتويات الجدول.
          </div>
        ) : students.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            لا توجد سجلات طلاب تطابق خيارات التصفية الحالية.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-[#0b101d] border-b border-slate-800 text-slate-400 text-xs font-bold">
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
                  <th className="p-4">القسم الفرعي</th>
                  <th className="p-4">التيليجرام</th>
                  <th className="p-4">حالة البصمة</th>
                  <th className="p-4">بيانات التوثيق والاعتماد</th>
                  <th className="p-4 text-center">
                    {isSuperAdmin ? "التحكم بالبصمة وإلغاء القيد" : "إجراءات التحكم"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {students.map((student) => {
                  const isDone = Boolean(student.isFingerprintActivated || student.isActivated);
                  const staffName = student.activatedByName || student.activatedByStaffName;
                  const isSelected = selectedStudentIds.includes(student.id);

                  return (
                    <tr
                      key={student.id}
                      className={`transition ${
                        isSelected ? "bg-red-950/20" : "hover:bg-slate-800/40"
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

                      {/* Student Name */}
                      <td className="p-4 font-bold text-white">
                        {student.fullName}
                      </td>

                      {/* Decrypted 14-digit National ID */}
                      <td className="p-4 font-mono font-bold text-slate-200">
                        <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs tracking-wider">
                          {student.nationalId}
                        </span>
                      </td>

                      {/* Academic Number */}
                      <td className="p-4 font-mono text-slate-300 text-xs">
                        {student.academicNumber}
                      </td>

                      {/* Group & Section */}
                      <td className="p-4 text-xs">
                        <div className="font-semibold text-slate-200">{student.groupName}</div>
                        <div className="text-slate-400 text-[11px]">{student.sectionName}</div>
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
                          <span className="text-[11px] text-slate-400">غير مرتبط</span>
                        )}
                      </td>

                      {/* Fingerprint Status Badge */}
                      <td className="p-4">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
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
                              <span className="text-emerald-300">{staffName || "المشرف المعتمد"}</span>
                            </div>
                            {student.activatedAt && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {formatCairoDateTime(student.activatedAt)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">قيد انتظار الحضور والدور</span>
                        )}
                      </td>

                      {/* Actions: Direct Activation / Revoke Activation / Delete (Super Admin) or View Only (Staff) */}
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
          <div className="p-4 border-t border-slate-800 bg-[#0b101d] flex items-center justify-between text-xs">
            <span className="text-slate-400">
              عرض {(page - 1) * 25 + 1} - {Math.min(page * 25, total)} من أصل {total} طالب
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>السابق</span>
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 25 >= total}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 disabled:opacity-40 flex items-center gap-1"
              >
                <span>التالي</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
