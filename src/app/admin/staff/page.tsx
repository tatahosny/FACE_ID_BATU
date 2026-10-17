"use client";

import { useState, useEffect, useMemo } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import {
  Users,
  ShieldCheck,
  Search,
  Plus,
  KeyRound,
  Lock,
  Unlock,
  AlertTriangle,
  Clock,
  Trash2,
  Edit3,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
  GraduationCap,
  RefreshCw,
  Ban,
  UserX,
  Send,
} from "lucide-react";

export default function AdminStaffManagementPage() {
  const [activeTab, setActiveTab] = useState<"staff" | "students">("staff");
  const [staff, setStaff] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "locked" | "banned">("all");

  // Create Staff Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("STAFF");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editTargetType, setEditTargetType] = useState<"USER" | "STUDENT">("USER");
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAcademicNumber, setEditAcademicNumber] = useState("");
  const [editRole, setEditRole] = useState("STAFF");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editIsBanned, setEditIsBanned] = useState(false);
  const [editBannedUntil, setEditBannedUntil] = useState("");
  const [editBanReason, setEditBanReason] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete Modal State
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string; targetType: "USER" | "STUDENT" } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/staff");
      const json = await res.json();
      if (json.success && json.data.staff) {
        setStaff(json.data.staff);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async (query = "") => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("type", "students");
      if (query.trim()) params.set("search", query.trim());
      const res = await fetch(`/api/admin/staff?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data.students) {
        setStudents(json.data.students);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "staff") {
      fetchStaff();
    } else {
      fetchStudents(searchQuery);
    }
  }, [activeTab]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === "students") {
      fetchStudents(searchQuery);
    }
  };

  const isItemBanned = (item: any) => {
    return item.bannedUntil && new Date(item.bannedUntil) > new Date();
  };

  const filteredStaff = useMemo(() => {
    return staff.filter((u) => {
      const matchSearch =
        u.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;

      const banned = isItemBanned(u);
      if (filterStatus === "active") return u.isActive && !banned;
      if (filterStatus === "locked") return !u.isActive;
      if (filterStatus === "banned") return banned;
      return true;
    });
  }, [staff, searchQuery, filterStatus]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const banned = isItemBanned(s);
      if (filterStatus === "active") return s.isActive && !banned;
      if (filterStatus === "locked") return !s.isActive;
      if (filterStatus === "banned") return banned;
      return true;
    });
  }, [students, filterStatus]);

  const handleOpenEdit = (item: any, type: "USER" | "STUDENT") => {
    setEditItem(item);
    setEditTargetType(type);
    setEditFullName(item.fullName || "");
    setEditEmail(item.email || "");
    setEditAcademicNumber(item.academicNumber || "");
    setEditRole(item.role || "STAFF");
    setEditPassword("");
    setShowEditPassword(false);
    setEditIsActive(item.isActive !== false);

    const banned = item.bannedUntil && new Date(item.bannedUntil) > new Date();
    setEditIsBanned(banned);
    if (item.bannedUntil) {
      const d = new Date(item.bannedUntil);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
      setEditBannedUntil(localISOTime);
    } else {
      setEditBannedUntil("");
    }
    setEditBanReason(item.banReason || "");
    setShowEditModal(true);
  };

  const applyBanPreset = (hours: number) => {
    const targetDate = new Date(Date.now() + hours * 60 * 60 * 1000);
    const tzOffset = targetDate.getTimezoneOffset() * 60000;
    const localISOTime = new Date(targetDate.getTime() - tzOffset).toISOString().slice(0, 16);
    setEditBannedUntil(localISOTime);
    setEditIsBanned(true);
  };

  const clearBan = () => {
    setEditIsBanned(false);
    setEditBannedUntil("");
    setEditBanReason("");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setEditSubmitting(true);
      setMessage(null);

      let banPayloadDate: string | null = null;
      if (editIsBanned && editBannedUntil) {
        banPayloadDate = new Date(editBannedUntil).toISOString();
      }

      const payload: any = {
        id: editItem.id,
        targetType: editTargetType,
        fullName: editFullName,
        email: editTargetType === "USER" ? editEmail : undefined,
        academicNumber: editTargetType === "STUDENT" ? editAcademicNumber : undefined,
        role: editTargetType === "USER" ? editRole : undefined,
        isActive: editIsActive,
        bannedUntil: banPayloadDate,
        banReason: editIsBanned ? editBanReason || "حظر مؤقت بقرار إداري" : null,
      };

      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }

      const res = await fetch("/api/admin/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessage({ text: json.error || "فشل تحديث الحساب", type: "error" });
        return;
      }

      setMessage({ text: json.message || "تم حفظ وتحديث الحساب بنجاح!", type: "success" });
      setShowEditModal(false);

      if (editTargetType === "USER") {
        await fetchStaff();
      } else {
        await fetchStudents(searchQuery);
      }
    } catch (err: any) {
      setMessage({ text: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreateSubmitting(true);
      setMessage(null);

      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: newFullName,
          email: newEmail,
          password: newPassword,
          role: newRole,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessage({ text: json.error || "فشل إنشاء الحساب", type: "error" });
        return;
      }

      setMessage({ text: "تم إنشاء حساب المستخدم بنجاح!", type: "success" });
      setShowCreateModal(false);
      setNewFullName("");
      setNewEmail("");
      setNewPassword("");
      await fetchStaff();
    } catch (err: any) {
      setMessage({ text: err.message || "حدث خطأ", type: "error" });
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteItem) return;
    try {
      setDeleteSubmitting(true);
      setMessage(null);

      const res = await fetch(
        `/api/admin/staff?id=${deleteItem.id}&targetType=${deleteItem.targetType}`,
        {
          method: "DELETE",
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessage({ text: json.error || "فشل حذف الحساب", type: "error" });
        return;
      }

      setMessage({ text: json.message || "تم حذف الحساب بنجاح", type: "success" });
      setDeleteItem(null);

      if (deleteItem.targetType === "USER") {
        await fetchStaff();
      } else {
        await fetchStudents(searchQuery);
      }
    } catch (err: any) {
      setMessage({ text: err.message || "حدث خطأ أثناء الحذف", type: "error" });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-blue-500" />
            <span>إدارة الحسابات الشاملة والرقابة الإدارية</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            صلاحيات السوبر أدمن الكاملة لتعديل بيانات أي مستخدم، تغيير كلمات المرور، قفل الحسابات، وفرض الحظر المؤقت.
          </p>
        </div>

        {activeTab === "staff" && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة موظف / مدير جديد</span>
          </button>
        )}
      </div>

      {/* Feedback Message */}
      {message && (
        <div
          className={`p-4 rounded-2xl text-sm font-medium flex items-center justify-between border ${
            message.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/40 border-red-500/40 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs underline text-slate-400 hover:text-white">
            إغلاق
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => {
            setActiveTab("staff");
            setSearchQuery("");
          }}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
            activeTab === "staff"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>طاقم العمل والمشرفين ({staff.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("students");
            setSearchQuery("");
          }}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
            activeTab === "students"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
              : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>حسابات الطلاب والرقابة التأديبية</span>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl backdrop-blur-xl flex flex-col sm:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === "staff"
                ? "ابحث بالاسم أو البريد الإلكتروني..."
                : "ابحث بالاسم أو الرقم الأكاديمي..."
            }
            className="w-full px-4 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pl-9"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-slate-400 font-bold ml-1">تصفية:</span>
          {(
            [
              { id: "all", label: "الكل" },
              { id: "active", label: "نشط ومعتمد" },
              { id: "locked", label: "حساب مغلق" },
              { id: "banned", label: "محظور مؤقتاً" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setFilterStatus(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterStatus === t.id
                  ? "bg-slate-800 text-blue-400 border border-blue-500/40"
                  : "bg-slate-950/60 text-slate-400 border border-slate-800 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}

          <button
            onClick={() => (activeTab === "staff" ? fetchStaff() : fetchStudents(searchQuery))}
            className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition mr-auto sm:mr-0"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">جاري تحميل وتحديث قائمة الحسابات...</p>
          </div>
        ) : activeTab === "staff" ? (
          /* Staff / Admin Table */
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right text-xs min-w-[700px]">
              <thead className="bg-[#0b101d] text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 font-bold">الاسم والبيانات</th>
                  <th className="py-3.5 px-4 font-bold">البريد الإلكتروني</th>
                  <th className="py-3.5 px-4 font-bold">الدور والصلاحية</th>
                  <th className="py-3.5 px-4 font-bold">حالة الحساب</th>
                  <th className="py-3.5 px-4 font-bold">تاريخ الإنشاء</th>
                  <th className="py-3.5 px-4 font-bold text-center">إجراءات السوبر أدمن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      لا يوجد مستخدمين مطابقين لمعايير البحث
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((u) => {
                    const banned = isItemBanned(u);
                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-sm">{u.fullName}</div>
                          <div className="text-[10px] font-mono text-slate-400">ID: {u.id.slice(0, 8)}...</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-cyan-300" dir="ltr">
                          {u.email}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              u.role === "SUPER_ADMIN"
                                ? "bg-purple-500/10 text-purple-300 border border-purple-500/30"
                                : "bg-blue-500/10 text-cyan-300 border border-blue-500/30"
                            }`}
                          >
                            {u.role === "SUPER_ADMIN" ? "مدير نظام عام" : "موظف بصمة"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {banned ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                <Clock className="w-3 h-3" />
                                <span>محظور حتى {formatCairoDateTime(u.bannedUntil)}</span>
                              </span>
                              {u.banReason && (
                                <div className="text-[10px] text-rose-400 truncate max-w-xs">
                                  السبب: {u.banReason}
                                </div>
                              )}
                            </div>
                          ) : !u.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              <Lock className="w-3 h-3" />
                              <span>حساب مقفل / معطل</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>نشط ومعتمد</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">{formatCairoDateTime(u.createdAt)}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenEdit(u, "USER")}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white border border-blue-500/30 transition flex items-center gap-1"
                              title="تعديل الحساب والصلاحيات والبان"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>
                            <button
                              onClick={() =>
                                setDeleteItem({ id: u.id, name: u.fullName, targetType: "USER" })
                              }
                              className="p-1.5 rounded-lg bg-red-600/20 text-red-300 hover:bg-red-600 hover:text-white border border-red-500/30 transition"
                              title="حذف الحساب"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Students Table */
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right text-xs min-w-[800px]">
              <thead className="bg-[#0b101d] text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-4 font-bold">اسم الطالب</th>
                  <th className="py-3.5 px-4 font-bold">الرقم الأكاديمي</th>
                  <th className="py-3.5 px-4 font-bold">السكشن الفرعي</th>
                  <th className="py-3.5 px-4 font-bold">حساب التيليجرام</th>
                  <th className="py-3.5 px-4 font-bold">كلمة المرور</th>
                  <th className="py-3.5 px-4 font-bold">حالة الحساب والعقوبات</th>
                  <th className="py-3.5 px-4 font-bold text-center">إجراءات السوبر أدمن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      لا يوجد طلاب مطابقين لمعايير البحث
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s) => {
                    const banned = isItemBanned(s);
                    return (
                      <tr key={s.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-sm">{s.fullName}</div>
                          <div className="text-[10px] text-slate-400">ID: {s.id.slice(0, 8)}...</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-300">
                          {s.academicNumber}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded font-bold text-xs bg-slate-950 text-cyan-300 border border-slate-800">
                            سكشن {s.subSection || "A"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs">
                          {s.telegramUsername ? (
                            <span className="text-sky-300 flex items-center gap-1" dir="ltr">
                              <Send className="w-3 h-3" />
                              <span>@{s.telegramUsername}</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">غير مربوط</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {s.hasPassword ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                              <KeyRound className="w-3 h-3" />
                              <span>مخصصة</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                              <span>الرقم القومي افتراضياً</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {banned ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                <Clock className="w-3 h-3" />
                                <span>بان حتى {formatCairoDateTime(s.bannedUntil)}</span>
                              </span>
                              {s.banReason && (
                                <div className="text-[10px] text-rose-400 truncate max-w-xs">
                                  {s.banReason}
                                </div>
                              )}
                            </div>
                          ) : !s.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              <Lock className="w-3 h-3" />
                              <span>حساب مقفل / معطل</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>نشط</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenEdit(s, "STUDENT")}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white border border-blue-500/30 transition flex items-center gap-1"
                              title="تعديل حساب الطالب، تعيين باسورد، أو حظر"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>
                            <button
                              onClick={() =>
                                setDeleteItem({ id: s.id, name: s.fullName, targetType: "STUDENT" })
                              }
                              className="p-1.5 rounded-lg bg-red-600/20 text-red-300 hover:bg-red-600 hover:text-white border border-red-500/30 transition"
                              title="حذف سجل الطالب"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: Create Staff User */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-800 text-white animate-scale-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                <span>إضافة حساب موظف / مشرف جديد</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3.5 text-right text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="محمد أحمد إبراهيم"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">البريد الإلكتروني الجامعي</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="staff@batu.edu.eg"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 font-mono text-left bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">كلمة المرور (6 خانات على الأقل)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 font-mono text-left bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">الدور والصلاحية</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="STAFF" className="bg-slate-900 text-white">موظف بصمة (Staff)</option>
                  <option value="SUPER_ADMIN" className="bg-slate-900 text-white">مدير نظام عام (Super Admin)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-md shadow-blue-600/30 transition disabled:opacity-50"
                >
                  {createSubmitting ? "جاري الإنشاء..." : "إنشاء الحساب الآن"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Comprehensive Edit & Ban Modal */}
      {showEditModal && editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-3xl max-w-xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-blue-500/40 text-white my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white">
                    تعديل حساب: {editItem.fullName}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {editTargetType === "USER" ? "حساب إداري / موظف" : "حساب طالب جامعي"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-right text-xs">
              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">الاسم الكامل</label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    {editTargetType === "STUDENT" ? "الرقم الأكاديمي" : "البريد الإلكتروني"}
                  </label>
                  {editTargetType === "STUDENT" ? (
                    <input
                      type="text"
                      required
                      value={editAcademicNumber}
                      onChange={(e) => setEditAcademicNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 font-mono font-bold bg-slate-950 text-amber-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <input
                      type="email"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 font-mono text-left bg-slate-950 text-cyan-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      dir="ltr"
                    />
                  )}
                </div>
              </div>

              {editTargetType === "USER" && (
                <div>
                  <label className="block font-bold text-slate-300 mb-1">الدور والصلاحية</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="STAFF" className="bg-slate-900 text-white">موظف بصمة (Staff)</option>
                    <option value="SUPER_ADMIN" className="bg-slate-900 text-white">مدير نظام عام (Super Admin)</option>
                  </select>
                </div>
              )}

              {/* Password Override */}
              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-200 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-blue-400" />
                    <span>تغيير / إعادة تعيين كلمة المرور</span>
                  </label>
                  <span className="text-[10px] text-slate-500">اتركها فارغة للاحتفاظ بالسابقة</span>
                </div>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="أدخل كلمة مرور جديدة (6 خانات على الأقل)..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 font-mono text-white placeholder-slate-600 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 pl-10"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute left-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    {showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Account Lock Toggle */}
              <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-200 flex items-center gap-1.5">
                    {editIsActive ? (
                      <Unlock className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Lock className="w-4 h-4 text-amber-400" />
                    )}
                    <span>حالة تشغيل الحساب (Account Status)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {editIsActive
                      ? "الحساب نشط ويُسمح لصاحبه بتسجيل الدخول واستخدام النظام."
                      : "الحساب مقفل ومعطل — يتم منع صاحبه فوراً من تسجيل الدخول."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setEditIsActive(!editIsActive)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                    editIsActive
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                  }`}
                >
                  {editIsActive ? "نشط (انقر للقفل)" : "مقفل (انقر للتفعيل)"}
                </button>
              </div>

              {/* Temporary Ban Section */}
              <div className="bg-rose-950/20 p-4 rounded-2xl border border-rose-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-rose-400" />
                    <span className="font-bold text-rose-200">نظام الحظر المؤقت (Temporary Ban)</span>
                  </div>

                  {editIsBanned ? (
                    <button
                      type="button"
                      onClick={clearBan}
                      className="text-[11px] font-bold text-rose-400 hover:text-white underline"
                    >
                      رفع الحظر الآن
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400">غير محظور حالياً</span>
                  )}
                </div>

                {/* Quick Ban Presets */}
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">فترات حظر سريعة:</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyBanPreset(24)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-rose-400 text-[11px] text-slate-300 hover:text-white transition"
                    >
                      24 ساعة
                    </button>
                    <button
                      type="button"
                      onClick={() => applyBanPreset(72)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-rose-400 text-[11px] text-slate-300 hover:text-white transition"
                    >
                      3 أيام
                    </button>
                    <button
                      type="button"
                      onClick={() => applyBanPreset(168)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-rose-400 text-[11px] text-slate-300 hover:text-white transition"
                    >
                      أسبوع
                    </button>
                    <button
                      type="button"
                      onClick={() => applyBanPreset(720)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 hover:border-rose-400 text-[11px] text-slate-300 hover:text-white transition"
                    >
                      شهر كامل
                    </button>
                  </div>
                </div>

                {/* Custom Ban Datetime & Reason */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      تاريخ وتوقيت انتهاء الحظر
                    </label>
                    <input
                      type="datetime-local"
                      value={editBannedUntil}
                      onChange={(e) => {
                        setEditBannedUntil(e.target.value);
                        setEditIsBanned(!!e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      سبب الحظر (يظهر للمستخدم عند الدخول)
                    </label>
                    <input
                      type="text"
                      value={editBanReason}
                      onChange={(e) => setEditBanReason(e.target.value)}
                      placeholder="مثال: مخالفة ضوابط الحجز أو السلوك"
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition disabled:opacity-50"
                >
                  {editSubmitting ? "جاري الحفظ والتطبيق..." : "حفظ التعديلات والعقوبات"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium text-xs transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Confirmation Modal */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-red-500/40 text-white text-right">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
              <UserX className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-black text-lg text-white">تأكيد حذف الحساب نهائياً</h3>
              <p className="text-xs text-slate-400">
                هل أنت متأكد تماماً من رغبتك في حذف حساب{" "}
                <span className="font-bold text-white">"{deleteItem.name}"</span>؟ هذا الإجراء لا يمكن التراجع عنه.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteSubmitting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/30 transition disabled:opacity-50"
              >
                {deleteSubmitting ? "جاري الحذف..." : "نعم، حذف الحساب"}
              </button>
              <button
                type="button"
                onClick={() => setDeleteItem(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium text-xs transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
