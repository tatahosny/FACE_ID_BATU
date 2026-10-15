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
} from "lucide-react";

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Filters
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [activationFilter, setActivationFilter] = useState("");
  const [search, setSearch] = useState("");

  // Load groups on mount
  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then((j) => j.success && setGroups(j.data.groups || []));
  }, []);

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
      if (activationFilter) params.set("activationStatus", activationFilter);
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

  useEffect(() => {
    fetchStudents();
  }, [page, selectedGroup, selectedSection, activationFilter]);

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

        <button
          onClick={fetchStudents}
          disabled={loading}
          className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold border border-slate-700 shadow-md transition flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
          <span>تحديث القائمة</span>
        </button>
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
          <span className="font-bold">تحكم ثنائي الاتجاه بالبصمة:</span> يمكنك <b>تفعيل البصمة</b> مباشرة لأي طالب غير مفعل ليتم توثيقه وإرسال إشعار التيليجرام له، أو <b>إلغاء البصمة وإعادة الحجز</b> لأي طالب مفعل ليتمكن من حجز دور جديد من الصفر.
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

      {/* Filters Bar */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-4 sm:p-5 space-y-4 backdrop-blur-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Group Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">تصفية بالمجموعة:</label>
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
            <label className="block text-xs font-bold text-slate-300 mb-1">تصفية بالسكشن:</label>
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

          {/* Search Input */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">بحث سريع:</label>
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="اسم أو رقم أكاديمي..."
                className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-950 text-white placeholder-slate-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center gap-1"
              >
                <Search className="w-3.5 h-3.5" />
                <span>بحث</span>
              </button>
            </form>
          </div>
        </div>

        {/* Clear Filters Helper */}
        {(selectedGroup || selectedSection || activationFilter || search) && (
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">الفلاتر النشطة تطبق على القائمة حالياً.</span>
            <button
              onClick={() => {
                setSelectedGroup("");
                setSelectedSection("");
                setActivationFilter("");
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
                  <th className="p-4">اسم الطالب</th>
                  <th className="p-4">الرقم القومي</th>
                  <th className="p-4">الرقم الأكاديمي</th>
                  <th className="p-4">المجموعة والسكشن</th>
                  <th className="p-4">التيليجرام</th>
                  <th className="p-4">حالة البصمة</th>
                  <th className="p-4">بيانات التوثيق والاعتماد</th>
                  <th className="p-4 text-center">التحكم المباشر بالبصمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {students.map((student) => {
                  const isDone = Boolean(student.isFingerprintActivated || student.isActivated);
                  const staffName = student.activatedByName || student.activatedByStaffName;

                  return (
                    <tr key={student.id} className="hover:bg-slate-800/40 transition">
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

                      {/* Actions: Direct Activation / Revoke Activation */}
                      <td className="p-4 text-center">
                        {isDone ? (
                          <button
                            onClick={() => handleRevokeActivation(student.id, student.fullName)}
                            disabled={actionLoading === student.id}
                            title="إلغاء اعتماد البصمة وإلغاء الدور ليتمكن الطالب من حجز دور جديد من البداية"
                            className="px-3 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition flex items-center gap-1.5 mx-auto disabled:opacity-50"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${actionLoading === student.id ? "animate-spin" : ""}`} />
                            <span>{actionLoading === student.id ? "جاري الإلغاء..." : "إلغاء البصمة وإعادة الحجز"}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivate(student.id, student.fullName)}
                            disabled={actionLoading === student.id}
                            title="تفعيل بصمة الوجه للطالب واعتمادها الآن وإرسال رسالة التهنئة على التيليجرام"
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5 mx-auto disabled:opacity-50"
                          >
                            <UserCheck className={`w-3.5 h-3.5 ${actionLoading === student.id ? "animate-spin" : ""}`} />
                            <span>{actionLoading === student.id ? "جاري التفعيل..." : "تفعيل البصمة الآن"}</span>
                          </button>
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
