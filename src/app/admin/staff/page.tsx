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
  RefreshCw,
  Ban,
  UserCheck,
  Sparkles,
} from "lucide-react";

export default function AdminStaffManagementPage() {
  const [staff, setStaff] = useState<any[]>([]);
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
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("STAFF");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editIsBanned, setEditIsBanned] = useState(false);
  const [editBannedUntil, setEditBannedUntil] = useState("");
  const [editBanReason, setEditBanReason] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete Modal State
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null);
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

  useEffect(() => {
    fetchStaff();
  }, []);

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

  const handleOpenEdit = (item: any) => {
    setEditItem(item);
    setEditFullName(item.fullName || "");
    setEditEmail(item.email || "");
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
        fullName: editFullName,
        email: editEmail,
        role: editRole,
        isActive: editIsActive,
        bannedUntil: banPayloadDate,
        banReason: editIsBanned ? editBanReason : null,
      };

      if (editPassword.trim().length > 0) {
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

      setMessage({ text: json.message || "تم حفظ التعديلات بنجاح", type: "success" });
      setShowEditModal(false);
      await fetchStaff();
    } catch (err: any) {
      setMessage({ text: err.message || "حدث خطأ أثناء حفظ التعديلات", type: "error" });
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

      setMessage({ text: "تم إنشاء حساب الموظف بنجاح", type: "success" });
      setShowCreateModal(false);
      setNewFullName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("STAFF");
      await fetchStaff();
    } catch (err: any) {
      setMessage({ text: err.message || "حدث خطأ أثناء إنشاء الحساب", type: "error" });
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;

    try {
      setDeleteSubmitting(true);
      setMessage(null);

      const res = await fetch(`/api/admin/staff?id=${deleteItem.id}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setMessage({ text: json.error || "فشل حذف الحساب", type: "error" });
        return;
      }

      setMessage({ text: json.message || "تم حذف الحساب بنجاح", type: "success" });
      setDeleteItem(null);
      await fetchStaff();
    } catch (err: any) {
      setMessage({ text: err.message || "حدث خطأ أثناء الحذف", type: "error" });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const superAdminsCount = staff.filter((s) => s.role === "SUPER_ADMIN").length;
  const staffOfficersCount = staff.filter((s) => s.role === "STAFF").length;
  const activeStaffCount = staff.filter((s) => s.isActive && !isItemBanned(s)).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12" dir="rtl">
      {/* Top Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-[#0e1628] to-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-mono font-bold tracking-wider">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>STAFF ACCESS CONTROL • إدارة طاقم العمل</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
              <span>إدارة طاقم العمل وموظفي البصمة</span>
              <Sparkles className="w-5 h-5 text-amber-400" />
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              التحكم المركزي بحسابات المشرفين العامين وموظفي شبابيك البصمة، تعيين الصلاحيات، وتحديث بيانات الدخول.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition flex items-center gap-2 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة موظف / مدير جديد</span>
          </button>
        </div>
      </div>

      {/* Feedback Message */}
      {message && (
        <div
          className={`p-4 rounded-2xl text-sm font-medium flex items-center justify-between border shadow-lg ${
            message.type === "success"
              ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-200"
              : "bg-red-950/60 border-red-500/50 text-red-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-xs font-bold text-slate-300 hover:text-white px-2 py-1 rounded bg-black/20">
            إغلاق
          </button>
        </div>
      )}

      {/* Staff Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>إجمالي طاقم العمل</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-white font-mono">{staff.length}</div>
          <div className="mt-1 text-[11px] text-blue-400 font-medium">مشرفين وموظفي شبابيك</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>مدراء النظام (Super Admins)</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-indigo-400 font-mono">{superAdminsCount}</div>
          <div className="mt-1 text-[11px] text-indigo-400/80 font-medium">صلاحية إدارية كاملة</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>موظفي البصمة (Staff)</span>
            <UserCheck className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-teal-400 font-mono">{staffOfficersCount}</div>
          <div className="mt-1 text-[11px] text-teal-400/80 font-medium">خدمة شبابيك T و D</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>الحسابات النشطة</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-emerald-400 font-mono">{activeStaffCount}</div>
          <div className="mt-1 text-[11px] text-emerald-400/80 font-medium">مفعلة وتعمل بالمنظومة</div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-slate-900/95 rounded-2xl border border-slate-800 p-4 shadow-xl backdrop-blur-xl flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم أو البريد الإلكتروني..."
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pl-9"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>

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
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                  : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}

          <button
            onClick={fetchStaff}
            className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition mr-auto sm:mr-0"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Staff Table */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">جاري تحميل وتحديث قائمة طاقم العمل...</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right text-xs min-w-[720px]">
              <thead className="bg-[#090d18] text-slate-400 uppercase border-b border-slate-800 font-bold">
                <tr>
                  <th className="py-4 px-4">اسم الموظف / المشرف</th>
                  <th className="py-4 px-4">البريد الإلكتروني الجامعي</th>
                  <th className="py-4 px-4">الدور والصلاحية</th>
                  <th className="py-4 px-4">حالة الحساب</th>
                  <th className="py-4 px-4">تاريخ الإنشاء</th>
                  <th className="py-4 px-4 text-center">إجراءات السوبر أدمن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-slate-500">
                      لا يوجد موظفين مطابقين للبحث
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((u) => {
                    const banned = isItemBanned(u);
                    const initial = u.fullName?.trim()?.charAt(0) || "م";
                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold text-xs flex items-center justify-center flex-shrink-0">
                              {initial}
                            </div>
                            <div>
                              <div className="font-bold text-white text-sm">{u.fullName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">ID: {u.id.slice(0, 8)}...</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-300 text-xs" dir="ltr">
                          {u.email}
                        </td>

                        <td className="py-3.5 px-4">
                          {u.role === "SUPER_ADMIN" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-400 bg-indigo-950/50 px-2.5 py-0.5 rounded-full border border-indigo-800/50">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>مدير نظام عام (Super Admin)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-400 bg-teal-950/50 px-2.5 py-0.5 rounded-full border border-teal-800/50">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>موظف شباك بصمة (Staff)</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {banned ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                <Clock className="w-3 h-3" />
                                <span>محظور حتى {formatCairoDateTime(u.bannedUntil)}</span>
                              </span>
                              {u.banReason && (
                                <div className="text-[10px] text-rose-400 truncate max-w-xs">{u.banReason}</div>
                              )}
                            </div>
                          ) : !u.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              <Lock className="w-3 h-3" />
                              <span>حساب مقفل</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>نشط</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-xs text-slate-400 font-mono">
                          {formatCairoDateTime(u.createdAt).split(" ")[0]}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white border border-blue-500/30 transition flex items-center gap-1 text-xs font-bold"
                              title="تعديل الحساب أو تغيير كلمة المرور"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>
                            <button
                              onClick={() => setDeleteItem({ id: u.id, name: u.fullName })}
                              className="p-1.5 rounded-xl bg-red-600/20 text-red-300 hover:bg-red-600 hover:text-white border border-red-500/30 transition"
                              title="حذف حساب الموظف"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-800 text-white animate-scale-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-400" />
                <span>إضافة حساب موظف / مشرف جديد</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3.5 text-right text-xs font-semibold">
              <div>
                <label className="block text-slate-300 mb-1">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="مثال: م. محمد أحمد إبراهيم"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">البريد الإلكتروني الجامعي *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="staff@batu.edu.eg"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 font-mono text-left bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">كلمة المرور (6 خانات على الأقل) *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 font-mono text-left bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">الدور والصلاحية *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="STAFF">موظف شباك بصمة (Staff)</option>
                  <option value="SUPER_ADMIN">مدير نظام عام (Super Admin)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold shadow-md shadow-blue-600/30 transition disabled:opacity-50"
                >
                  {createSubmitting ? "جاري الإنشاء..." : "إنشاء الحساب الآن"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Staff Account */}
      {showEditModal && editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-900 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-800 text-white max-h-[90vh] overflow-y-auto custom-scrollbar animate-scale-up">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                <span>تعديل حساب الموظف / المشرف</span>
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-right text-xs font-semibold">
              <div>
                <label className="block text-slate-300 mb-1">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">البريد الإلكتروني الجامعي *</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 font-mono text-left bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">الدور والصلاحية *</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="STAFF">موظف شباك بصمة (Staff)</option>
                  <option value="SUPER_ADMIN">مدير نظام عام (Super Admin)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="block text-slate-300 mb-1">تعيين كلمة مرور جديدة (اتركها فارغة إذا لم ترغب بالتغيير)</label>
                <div className="relative">
                  <input
                    type={showEditPassword ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="كلمة مرور جديدة..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 font-mono text-left bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 pl-10"
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

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold">حالة الحساب العامة:</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    <span className="mr-3 text-xs font-bold text-slate-300">
                      {editIsActive ? "نشط ومفعل" : "معطل / مقفل"}
                    </span>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-bold">فرض حظر مؤقت:</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsBanned}
                      onChange={(e) => {
                        setEditIsBanned(e.target.checked);
                        if (!e.target.checked) clearBan();
                        else applyBanPreset(24);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                    <span className="mr-3 text-xs font-bold text-slate-300">
                      {editIsBanned ? "محظور مؤقتاً" : "غير محظور"}
                    </span>
                  </label>
                </div>

                {editIsBanned && (
                  <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3 space-y-2.5">
                    <div>
                      <label className="block text-[11px] text-rose-300 font-bold mb-1">تاريخ ووقت انتهاء الحظر:</label>
                      <input
                        type="datetime-local"
                        value={editBannedUntil}
                        onChange={(e) => setEditBannedUntil(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-rose-500/40 bg-slate-950 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-rose-300 font-bold mb-1">سبب الحظر:</label>
                      <input
                        type="text"
                        value={editBanReason}
                        onChange={(e) => setEditBanReason(e.target.value)}
                        placeholder="سبب إداري..."
                        className="w-full px-3 py-1.5 rounded-lg border border-rose-500/40 bg-slate-950 text-white text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition disabled:opacity-50"
                >
                  {editSubmitting ? "جاري الحفظ..." : "حفظ التعديلات"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Confirmation */}
      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-900 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-red-500/40 text-white text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto border border-red-500/30">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-base text-white">تأكيد حذف الحساب نهائياً</h3>
              <p className="text-xs text-slate-400 mt-1">
                هل أنت متأكد من حذف حساب &quot;{deleteItem.name}&quot; نهائياً؟ لن يتمكن من تسجيل الدخول إلى المنظومة بعد الآن.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteSubmitting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition disabled:opacity-50"
              >
                {deleteSubmitting ? "جاري الحذف..." : "نعم، حذف الحساب"}
              </button>
              <button
                onClick={() => setDeleteItem(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
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
