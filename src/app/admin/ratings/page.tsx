"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Star,
  Send,
  Users,
  MessageCircle,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Search,
  UserCheck,
  Megaphone,
  BarChart2,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  X,
  Filter,
  Trash2,
  ShieldAlert,
  HelpCircle,
  Mail,
} from "lucide-react";

interface Rating {
  id: string;
  rating: number;
  message: string | null;
  type: "SERVICE" | "ISSUE";
  reasonRequestedAt?: string | null;
  createdAt: string;
  requestCampaignId: string | null;
  studentId: string;
  studentFullName: string;
  studentAcademicNumber: string;
  telegramUserId?: number | null;
  sectionName: string;
  groupName: string;
}

interface Stats {
  totalRatings: number;
  averageRating: number;
  fiveStars: number;
  fourStars: number;
  threeStars: number;
  twoStars: number;
  oneStar: number;
  issueCount: number;
  serviceCount: number;
  lowRatingsTotal?: number;
  lowRatingsWithoutReason?: number;
  lowRatingsWithReason?: number;
  lowRatingsWarned?: number;
  totalStudents?: number;
  eligibleStudents?: number;
  unlinkedStudents?: number;
}

interface Campaign {
  id: string;
  title: string;
  targetType: string;
  status: string;
  sentCount: number;
  failedCount: number;
  totalRecipients?: number;
  createdAt: string;
  sentAt: string | null;
  creatorName: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Student {
  id: string;
  fullName: string;
  academicNumber: string;
  telegramUserId: number | null;
}

function StarDisplay({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`${cls} ${s <= rating ? "text-amber-400 fill-amber-400" : "text-slate-600"}`}
        />
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-[#0d1322]/80 border border-slate-800/60 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-700 transition-all">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-xl font-black text-white">{value}</p>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminRatingsPage() {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters & Search
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Campaign form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formTargetType, setFormTargetType] = useState<"ALL" | "STUDENT">("ALL");
  const [formStudentSearch, setFormStudentSearch] = useState("");
  const [formStudentResults, setFormStudentResults] = useState<Student[]>([]);
  const [formSelectedStudent, setFormSelectedStudent] = useState<Student | null>(null);
  const [formSearching, setFormSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Low Ratings Follow-Up & Cancellation State
  const [showLowRatingsModal, setShowLowRatingsModal] = useState(false);
  const [lowRatingTarget, setLowRatingTarget] = useState<"UNREASONED" | "ALL_LOW">("UNREASONED");
  const [lowRatingCustomMsg, setLowRatingCustomMsg] = useState("");
  const [sendingLowRatingMsg, setSendingLowRatingMsg] = useState(false);
  const [cancellingLowRatings, setCancellingLowRatings] = useState(false);
  const [cancelNotifyStudent, setCancelNotifyStudent] = useState(true);
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);

  // Single rating delete confirmation
  const [ratingToDelete, setRatingToDelete] = useState<Rating | null>(null);
  const [deletingRating, setDeletingRating] = useState(false);
  const [deleteNotifyStudent, setDeleteNotifyStudent] = useState(true);
  const [sendingIndividualReason, setSendingIndividualReason] = useState<string | null>(null);

  // Auto-Send Loop & Live Progress Bar State
  const [activeAutoSend, setActiveAutoSend] = useState<{
    campaignId: string;
    title: string;
    sent: number;
    failed: number;
    total: number;
    remaining: number;
    isPaused: boolean;
    isCompleted: boolean;
  } | null>(null);

  const pauseAutoSendRef = useRef(false);
  const isAutoSendingRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/api/admin/ratings?page=${page}&limit=15&filter=${filter}`;
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setRatings(json.data.ratings);
        setStats(json.data.stats);
        setCampaigns(json.data.campaigns);
        setPagination(json.data.pagination);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, filter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle sending reason requests to low rating students
  const handleSendLowRatingReasons = async () => {
    try {
      setSendingLowRatingMsg(true);
      const res = await fetch("/api/admin/ratings/request-reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: lowRatingTarget,
          customMessage: lowRatingCustomMsg.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: json.message || "تم إرسال طلبات توضيح التقييم بنجاح", type: "success" });
        setShowLowRatingsModal(false);
        fetchData();
      } else {
        setStatusMsg({ text: json.error || "فشل إرسال التنبيهات", type: "error" });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setSendingLowRatingMsg(false);
    }
  };

  // Handle batch cancellation of low ratings without a reason
  const handleCancelUnreasonedLowRatings = async () => {
    try {
      setCancellingLowRatings(true);
      const res = await fetch(
        `/api/admin/ratings?action=cancel_unreasoned_low&notifyStudent=${cancelNotifyStudent ? "true" : "false"}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: json.message || "تم إلغاء التقييمات بنجاح", type: "success" });
        setShowCancelConfirmModal(false);
        setShowLowRatingsModal(false);
        fetchData();
      } else {
        setStatusMsg({ text: json.error || "فشل إلغاء التقييمات", type: "error" });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || "حدث خطأ أثناء الإلغاء", type: "error" });
    } finally {
      setCancellingLowRatings(false);
    }
  };

  // Send single student reason request
  const handleSendIndividualReason = async (r: Rating) => {
    try {
      setSendingIndividualReason(r.id);
      const res = await fetch("/api/admin/ratings/request-reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "SINGLE",
          ratingId: r.id,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: `تم إرسال تنبيه طلب التوضيح للطالب ${r.studentFullName} بنجاح`, type: "success" });
        fetchData();
      } else {
        setStatusMsg({ text: json.error || "فشل إرسال التنبيه", type: "error" });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || "حدث خطأ أثناء الإرسال", type: "error" });
    } finally {
      setSendingIndividualReason(null);
    }
  };

  // Delete single rating
  const handleDeleteSingleRating = async () => {
    if (!ratingToDelete) return;
    try {
      setDeletingRating(true);
      const res = await fetch(
        `/api/admin/ratings?id=${ratingToDelete.id}&notifyStudent=${deleteNotifyStudent ? "true" : "false"}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: "تم إلغاء التقييم بنجاح", type: "success" });
        setRatingToDelete(null);
        fetchData();
      } else {
        setStatusMsg({ text: json.error || "فشل إلغاء التقييم", type: "error" });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || "حدث خطأ أثناء إلغاء التقييم", type: "error" });
    } finally {
      setDeletingRating(false);
    }
  };

  const searchStudents = async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setFormStudentResults([]);
      return;
    }
    try {
      setFormSearching(true);
      const res = await fetch(`/api/students?search=${encodeURIComponent(q)}&limit=8`);
      const json = await res.json();
      if (json.success) {
        setFormStudentResults(json.data.items || json.data.students || []);
      }
    } catch {}
    finally { setFormSearching(false); }
  };

  // Delivery Details Modal State
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryCampaignId, setDeliveryCampaignId] = useState<string | null>(null);
  const [deliveryData, setDeliveryData] = useState<{
    campaign: any;
    summary: {
      totalEligible: number;
      deliveredCount: number;
      failedCount: number;
      pendingCount: number;
      ratingsReceived: number;
      responseRate: string;
    };
    recipients: any[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  } | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliverySearch, setDeliverySearch] = useState("");
  const [deliveryFilterStatus, setDeliveryFilterStatus] = useState("ALL");
  const [deliveryPage, setDeliveryPage] = useState(1);

  const fetchDeliveryDetails = useCallback(
    async (cId?: string | null, pageNum = 1, search = "", status = "ALL") => {
      try {
        setDeliveryLoading(true);
        let url = `/api/admin/ratings/recipients?page=${pageNum}&limit=30`;
        if (cId) url += `&campaignId=${cId}`;
        if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
        if (status && status !== "ALL") url += `&status=${status}`;

        const res = await fetch(url);
        const json = await res.json();
        if (json.success) {
          setDeliveryData(json.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setDeliveryLoading(false);
      }
    },
    []
  );

  const openDeliveryModal = (cId?: string) => {
    const targetId = cId || (campaigns.length > 0 ? campaigns[0].id : null);
    setDeliveryCampaignId(targetId);
    setDeliveryPage(1);
    setDeliverySearch("");
    setDeliveryFilterStatus("ALL");
    setShowDeliveryModal(true);
    fetchDeliveryDetails(targetId, 1, "", "ALL");
  };

  const startBackgroundPolling = (campaignId: string, campaignTitle: string, totalRecipients: number) => {
    setActiveAutoSend({
      campaignId,
      title: campaignTitle,
      sent: 0,
      failed: 0,
      total: totalRecipients,
      remaining: totalRecipients,
      isPaused: false,
      isCompleted: false,
    });

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/ratings/recipients?campaignId=${campaignId}&limit=1`);
        const json = await res.json();
        if (json.success && json.data) {
          const { summary, campaign } = json.data;
          const sent = summary.deliveredCount ?? 0;
          const failed = summary.failedCount ?? 0;
          const total = summary.totalEligible ?? totalRecipients;
          const remaining = summary.pendingCount ?? Math.max(0, total - sent - failed);
          const isDone = campaign?.status === "SENT" || (remaining === 0 && total > 0);

          setActiveAutoSend((prev) =>
            prev
              ? {
                  ...prev,
                  sent,
                  failed,
                  total,
                  remaining,
                  isCompleted: isDone,
                }
              : null
          );

          if (isDone) {
            clearInterval(intervalId);
            await fetchData();
            setStatusMsg({
              text: `🎉 اكتمل إرسال استبيان التقييم تلقائياً بنجاح لجميع الطلاب (${total})!`,
              type: "success",
            });
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 1500);
  };

  const handleSendCampaign = async () => {
    if (!formTitle.trim()) {
      setStatusMsg({ text: "يرجى كتابة عنوان للحملة", type: "error" });
      return;
    }
    if (formTargetType === "STUDENT" && !formSelectedStudent) {
      setStatusMsg({ text: "يرجى اختيار طالب", type: "error" });
      return;
    }
    try {
      setSending(true);
      setStatusMsg(null);
      const body: any = {
        title: formTitle,
        targetType: formTargetType,
      };
      if (formTargetType === "STUDENT" && formSelectedStudent) {
        body.targetStudentId = formSelectedStudent.id;
      }
      const res = await fetch("/api/admin/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        const campaignData = json.data;
        setShowForm(false);
        setFormTitle("");
        setFormTargetType("ALL");
        setFormSelectedStudent(null);
        setFormStudentSearch("");

        setStatusMsg({
          text: `🚀 تم إطلاق الحملة لـ ${campaignData.totalRecipients} طالب بنجاح! يتم الإرسال تلقائياً في السيرفر.`,
          type: "success",
        });

        // Start live polling of server autonomous background delivery
        startBackgroundPolling(
          campaignData.campaignId,
          campaignData.title || formTitle,
          campaignData.totalRecipients
        );
      } else {
        setStatusMsg({ text: json.error || "فشل الإرسال", type: "error" });
      }
    } catch {
      setStatusMsg({ text: "خطأ في الاتصال بالسيرفر", type: "error" });
    } finally {
      setSending(false);
    }
  };

  const avgForDisplay = stats?.averageRating
    ? Number(stats.averageRating).toFixed(1)
    : "—";

  const ratingBarPct = (count: number) => {
    if (!stats?.totalRatings || stats.totalRatings === 0) return 0;
    return Math.round((count / stats.totalRatings) * 100);
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 p-4 sm:p-6 font-arabic" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
            لوحة التقييمات والآراء
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            إرسال استبيانات التقييم عبر التيليجرام ومتابعة آراء الطلاب
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowLowRatingsModal(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-950/80 via-amber-950/60 to-rose-950/80 hover:from-rose-900/90 hover:to-amber-900/90 border border-rose-500/40 text-rose-200 hover:text-white transition text-sm font-bold flex items-center gap-2 shadow-lg shadow-rose-950/40 active:scale-95"
            title="متابعة وإرسال تنبيهات للطلاب الذين قيّموا بنجمة أو نجمتين"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>متابعة تقييمات ⭐1 و ⭐2</span>
            {stats?.lowRatingsWithoutReason !== undefined && stats.lowRatingsWithoutReason > 0 ? (
              <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-mono font-bold animate-pulse">
                {stats.lowRatingsWithoutReason} بدون سبب
              </span>
            ) : (
              <span className="bg-slate-800 text-slate-300 text-xs px-2 py-0.5 rounded-full font-mono">
                {stats?.lowRatingsTotal || 0}
              </span>
            )}
          </button>
          <button
            onClick={() => openDeliveryModal()}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-900/60 to-blue-900/60 hover:from-indigo-800/80 hover:to-blue-800/80 border border-indigo-500/40 text-indigo-200 hover:text-white transition text-sm font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/10 active:scale-95"
          >
            <Users className="w-4 h-4 text-indigo-400" />
            <span>تقرير استلام الرسائل</span>
            <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded-full font-mono border border-indigo-400/30">
              {stats?.eligibleStudents ? `${stats.eligibleStudents} طالب` : "333"}
            </span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition text-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <button
            id="send-feedback-survey-btn"
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all active:scale-95"
          >
            <Send className="w-4 h-4" />
            إرسال استبيان جديد
          </button>
        </div>
      </div>

      {/* Status Message */}
      {statusMsg && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
            statusMsg.type === "success"
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              : "bg-red-500/15 border border-red-500/30 text-red-300"
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Live Auto-Send Progress Widget */}
      {activeAutoSend && (
        <div className="mb-6 bg-gradient-to-r from-[#0d1322] via-amber-950/40 to-[#0d1322] border-2 border-amber-500/50 rounded-2xl p-5 shadow-2xl backdrop-blur-xl text-white space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                {!activeAutoSend.isCompleted && !activeAutoSend.isPaused && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                    activeAutoSend.isCompleted
                      ? "bg-emerald-500"
                      : activeAutoSend.isPaused
                      ? "bg-amber-500"
                      : "bg-amber-400"
                  }`}
                ></span>
              </span>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span>
                    {activeAutoSend.isCompleted
                      ? "✅ اكتمل إرسال استبيان التقييم للجميع بنجاح"
                      : activeAutoSend.isPaused
                      ? "⏸️ تم إيقاف إرسال التقييمات مؤقتاً"
                      : "🚀 جاري إرسال استبيان التقييم لجميع الطلاب تلقائياً..."}
                  </span>
                </h3>
                <p className="text-xs text-amber-200/80 font-medium truncate max-w-md mt-0.5">
                  حملة التقييم: «{activeAutoSend.title}»
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openDeliveryModal(activeAutoSend.campaignId)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-400/40 font-bold text-xs transition flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>تفاصيل المستلمين</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAutoSend(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-700 transition"
              >
                إغلاق الشريط ✖
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {(() => {
            const processed = activeAutoSend.sent + activeAutoSend.failed;
            const pct =
              activeAutoSend.total > 0
                ? Math.min(100, Math.round((processed / activeAutoSend.total) * 100))
                : activeAutoSend.isCompleted
                ? 100
                : 0;
            return (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-mono">
                    تمت معالجة{" "}
                    <b className="text-white font-bold">{processed}</b> من أصل{" "}
                    <b className="text-white font-bold">{activeAutoSend.total}</b> طالب
                  </span>
                  <span className="font-mono font-black text-amber-400 text-sm">{pct}%</span>
                </div>
                <div className="w-full bg-slate-950/80 rounded-full h-3 p-0.5 border border-amber-900/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      activeAutoSend.isCompleted
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : "bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-400"
                    }`}
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>
            );
          })()}

          {/* Quick Metrics Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center font-mono text-xs">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2">
              <span className="text-slate-400 block text-[10px]">المرسل بنجاح</span>
              <span className="text-emerald-400 font-bold text-sm">{activeAutoSend.sent}</span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2">
              <span className="text-slate-400 block text-[10px]">فشل الإرسال</span>
              <span className="text-red-400 font-bold text-sm">{activeAutoSend.failed}</span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2">
              <span className="text-slate-400 block text-[10px]">المتبقي في الطابور</span>
              <span className="text-amber-400 font-bold text-sm">{activeAutoSend.remaining}</span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2">
              <span className="text-slate-400 block text-[10px]">إجمالي الطلاب المؤهلين</span>
              <span className="text-amber-300 font-bold text-sm">{activeAutoSend.total}</span>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="إجمالي التقييمات" value={stats?.totalRatings ?? "—"} icon={Star} color="bg-amber-500/20 text-amber-400" />
        <StatCard label="متوسط التقييم" value={avgForDisplay} sub="من 5 نجوم" icon={TrendingUp} color="bg-blue-500/20 text-blue-400" />
        <StatCard
          label="تقييمات ⭐1 و ⭐2"
          value={stats?.lowRatingsTotal ?? "—"}
          sub={stats?.lowRatingsWithoutReason ? `⚠️ ${stats.lowRatingsWithoutReason} بدون سبب` : "جميعها موثقة"}
          icon={AlertTriangle}
          color="bg-rose-500/20 text-rose-400"
        />
        <StatCard label="بلاغات مشاكل" value={stats?.issueCount ?? "—"} icon={ShieldAlert} color="bg-red-500/20 text-red-400" />
        <StatCard label="حملات مرسلة" value={campaigns.length} icon={Megaphone} color="bg-violet-500/20 text-violet-400" />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Star Distribution */}
        <div className="bg-[#0d1322]/80 border border-slate-800/60 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-amber-400" />
            توزيع النجوم
          </h2>
          <div className="space-y-2.5">
            {[
              { stars: 5, count: stats?.fiveStars || 0, color: "bg-emerald-500" },
              { stars: 4, count: stats?.fourStars || 0, color: "bg-blue-500" },
              { stars: 3, count: stats?.threeStars || 0, color: "bg-amber-500" },
              { stars: 2, count: stats?.twoStars || 0, color: "bg-orange-500" },
              { stars: 1, count: stats?.oneStar || 0, color: "bg-red-500" },
            ].map(({ stars, count, color }) => (
              <div key={stars} className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 w-14 flex-shrink-0">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs text-slate-400 font-bold">{stars}</span>
                </div>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all duration-500`}
                    style={{ width: `${ratingBarPct(count)}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400 w-8 text-left flex-shrink-0">{count}</span>
              </div>
            ))}
          </div>
          {stats && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>تقييمات خدمة</span>
                <span className="text-emerald-400 font-bold">{stats.serviceCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                <span>بلاغات مشاكل</span>
                <span className="text-red-400 font-bold">{stats.issueCount}</span>
              </div>
            </div>
          )}
        </div>

        {/* Recent Campaigns */}
        <div className="lg:col-span-2 bg-[#0d1322]/80 border border-slate-800/60 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-violet-400" />
            سجل الحملات المرسلة
          </h2>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">لا توجد حملات بعد</div>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {campaigns.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 bg-slate-900/60 rounded-xl px-3 py-2.5 border border-slate-800/50">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">{c.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {c.targetType === "ALL" ? "جميع الطلاب" : "طالب واحد"} • {c.sentCount} مرسل
                      {c.failedCount > 0 && ` • ${c.failedCount} فشل`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openDeliveryModal(c.id)}
                      className="px-2.5 py-1 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition flex items-center gap-1 shadow-sm"
                      title="عرض تقرير المستلمين لهذه الحملة"
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{c.sentCount} استلموا</span>
                    </button>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      c.status === "SENT" ? "bg-emerald-500/20 text-emerald-400" :
                      c.status === "SENDING" ? "bg-blue-500/20 text-blue-400 animate-pulse" :
                      c.status === "FAILED" ? "bg-red-500/20 text-red-400" : "bg-slate-700 text-slate-400"
                    }`}>
                      {c.status === "SENT" ? "مكتمل" : c.status === "SENDING" ? "جاري الإرسال" : c.status === "FAILED" ? "فشل" : "معلق"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ratings Table */}
      <div className="bg-[#0d1322]/80 border border-slate-800/60 rounded-2xl overflow-hidden shadow-xl">
        {/* Table Top Header */}
        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">
              ردود التقييمات ({pagination?.total ?? 0})
            </h2>
          </div>
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 px-2 font-mono">
                {page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto p-3 bg-slate-950/40 border-b border-slate-800/60 scrollbar-none">
          {[
            { id: "all", label: "جميع التقييمات", count: stats?.totalRatings || 0 },
            {
              id: "low",
              label: "تقييمات منخفضة (⭐1 و ⭐2)",
              count: stats?.lowRatingsTotal || 0,
              badgeCls: "bg-amber-500/20 text-amber-300",
            },
            {
              id: "low_unreasoned",
              label: "⚠️ بدون سبب توضيحي",
              count: stats?.lowRatingsWithoutReason || 0,
              badgeCls: "bg-rose-500/20 text-rose-300 font-bold",
            },
            {
              id: "low_reasoned",
              label: "✅ موثقة بشكوى",
              count: stats?.lowRatingsWithReason || 0,
              badgeCls: "bg-emerald-500/20 text-emerald-300",
            },
            {
              id: "issues",
              label: "بلاغات المشاكل",
              count: stats?.issueCount || 0,
              badgeCls: "bg-red-500/20 text-red-300",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setFilter(tab.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap border ${
                filter === tab.id
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm"
                  : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  tab.badgeCls || "bg-slate-800 text-slate-400"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Bar & Quick Low Ratings Actions */}
        <div className="px-5 py-3 border-b border-slate-800/40 bg-slate-900/20 flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-500" />
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="بحث باسم الطالب أو الرقم الأكاديمي..."
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition"
            />
          </div>

          {(filter === "low" || filter === "low_unreasoned") && (stats?.lowRatingsWithoutReason ?? 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  setLowRatingTarget("UNREASONED");
                  setShowLowRatingsModal(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إرسال تنبيه للمطالبة بالسبب ({stats?.lowRatingsWithoutReason})</span>
              </button>
              <button
                onClick={() => setShowCancelConfirmModal(true)}
                className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إلغاء التقييمات بدون سبب</span>
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
          </div>
        ) : ratings.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Star className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-sm font-semibold">لا توجد تقييمات مطابقة لهذا الفلتر</p>
            <p className="text-xs text-slate-600 mt-1">جرب تغيير خيارات التصفية أو البحث</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {ratings.map((r) => {
              const isLowRating = r.rating <= 2;
              const hasReason = !!r.message && r.message.trim().length > 0;

              return (
                <div
                  key={r.id}
                  className={`px-5 py-4 flex items-start justify-between gap-4 transition ${
                    isLowRating && !hasReason
                      ? "bg-rose-950/10 hover:bg-rose-950/20"
                      : "hover:bg-slate-900/30"
                  }`}
                >
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className="flex-shrink-0 pt-0.5 text-center">
                      <StarDisplay rating={r.rating} />
                      <p className="text-[10px] text-slate-500 mt-1 font-mono font-bold">
                        {r.rating}/5
                      </p>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Reason / Complaint text */}
                      {hasReason ? (
                        <div className="mb-2">
                          <p className="text-sm text-slate-200 leading-relaxed bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                            {r.type === "ISSUE" && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full ml-2 font-bold border border-red-500/30">
                                <AlertTriangle className="w-3 h-3" />
                                بلاغ مشكلة / شكوى
                              </span>
                            )}
                            &quot;{r.message}&quot;
                          </p>
                        </div>
                      ) : isLowRating ? (
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-lg font-bold">
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            تقييم منخفض بدون توضيح سبب أو شكوى
                          </span>
                          {r.reasonRequestedAt && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md">
                              <Clock className="w-3 h-3 text-amber-400" />
                              تم إرسال تنبيه:{" "}
                              {new Date(r.reasonRequestedAt).toLocaleTimeString("ar-EG", {
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          )}
                        </div>
                      ) : null}

                      {/* Student info metadata */}
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1 font-semibold text-slate-200">
                          <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                          {r.studentFullName}
                        </span>
                        <span className="text-slate-700">•</span>
                        <span className="font-mono text-slate-300">{r.studentAcademicNumber}</span>
                        <span className="text-slate-700">•</span>
                        <span>
                          {r.groupName} / {r.sectionName}
                        </span>
                        <span className="text-slate-700">•</span>
                        <span className="font-mono text-slate-500">
                          {new Date(r.createdAt).toLocaleString("ar-EG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Row action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0 pt-1">
                    {isLowRating && !hasReason && (
                      <button
                        type="button"
                        onClick={() => handleSendIndividualReason(r)}
                        disabled={sendingIndividualReason === r.id}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                        title="إرسال رسالة للطالب على تيليجرام يطالبه بذكر سبب التقييم وإلا يُلغى"
                      >
                        <Send
                          className={`w-3.5 h-3.5 ${
                            sendingIndividualReason === r.id ? "animate-spin" : ""
                          }`}
                        />
                        <span>{r.reasonRequestedAt ? "إعادة التنبيه" : "طلب توضيح"}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRatingToDelete(r)}
                      className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/40 text-slate-400 text-xs transition"
                      title="إلغاء هذا التقييم"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Campaign Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1322] border border-slate-700/60 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-400" />
                إرسال استبيان تقييم جديد
              </h3>
              <button onClick={() => { setShowForm(false); setStatusMsg(null); }}
                className="text-slate-400 hover:text-white transition p-1">✕</button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  عنوان الحملة (للسجلات الداخلية)
                </label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="مثال: استبيان جودة الخدمة — أكتوبر 2026"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">المستهدفون بالاستبيان</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["ALL", "STUDENT"] as const).map((t) => (
                    <button key={t} onClick={() => { setFormTargetType(t); setFormSelectedStudent(null); setFormStudentSearch(""); setFormStudentResults([]); }}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition ${
                        formTargetType === t ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}>
                      {t === "ALL" ? (
                        <span className="flex items-center justify-center gap-1.5"><Users className="w-3.5 h-3.5" />جميع الطلاب</span>
                      ) : (
                        <span className="flex items-center justify-center gap-1.5"><UserCheck className="w-3.5 h-3.5" />طالب محدد</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {formTargetType === "STUDENT" && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">البحث عن الطالب</label>
                  {formSelectedStudent ? (
                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-emerald-300">{formSelectedStudent.fullName}</p>
                        <p className="text-[11px] text-emerald-600">{formSelectedStudent.academicNumber}</p>
                      </div>
                      <button onClick={() => { setFormSelectedStudent(null); setFormStudentSearch(""); }}
                        className="text-slate-400 hover:text-red-400 text-xs transition">تغيير</button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input
                          value={formStudentSearch}
                          onChange={(e) => { setFormStudentSearch(e.target.value); searchStudents(e.target.value); }}
                          placeholder="ابحث بالاسم أو الرقم الأكاديمي..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition"
                        />
                      </div>
                      {formSearching && <p className="text-xs text-slate-500 mt-1 px-1">جاري البحث...</p>}
                      {formStudentResults.length > 0 && (
                        <div className="mt-1.5 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                          {formStudentResults.map((s) => (
                            <button key={s.id} onClick={() => { setFormSelectedStudent(s); setFormStudentResults([]); setFormStudentSearch(""); }}
                              className="w-full text-right px-3 py-2.5 hover:bg-slate-800 transition border-b border-slate-800/60 last:border-0">
                              <p className="text-sm text-slate-200">{s.fullName}</p>
                              <p className="text-[11px] text-slate-500">{s.academicNumber}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed">
                <p className="text-amber-400/90 font-bold mb-1.5 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  أزرار تفاعلية فورية داخل التليجرام:
                </p>
                <p>تصل الرسالة للطالب وبها <span className="text-slate-200 font-semibold">أزرار أصلية (1 إلى 5 نجوم)</span> + زر <span className="text-red-400 font-semibold">«⚠️ واجهت مشكلة؟»</span>.</p>
                <p className="mt-1 text-slate-500">عند الضغط، يتم تسجيل تقييم الطالب فوراً أو يُطلب منه كتابة تفاصيل مشكلته لتصلك مباشرة في هذه الصفحة.</p>
              </div>

              {statusMsg && statusMsg.type === "error" && (
                <div className="px-3 py-2.5 bg-red-500/15 border border-red-500/30 rounded-xl text-sm text-red-300">
                  {statusMsg.text}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowForm(false); setStatusMsg(null); }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition">
                إلغاء
              </button>
              <button onClick={handleSendCampaign} disabled={sending}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-sm transition disabled:opacity-60 flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20">
                {sending ? (<><RefreshCw className="w-4 h-4 animate-spin" />جاري الإرسال...</>) : (<><Send className="w-4 h-4" />إرسال الاستبيان</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Details Modal */}
      {showDeliveryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-[#0d1322] border border-slate-700/80 rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">تقرير استلام رسائل الاستبيان</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {deliveryData?.campaign ? `حملة: ${deliveryData.campaign.title}` : "متابعة وصول الرسائل للطلاب"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="text-slate-400 hover:text-white transition p-2 rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-3.5 text-center">
                  <p className="text-xs text-emerald-400 font-semibold mb-1">تم الاستلام بنجاح</p>
                  <p className="text-2xl font-black text-emerald-300 font-mono">
                    {deliveryData?.summary.deliveredCount ?? "—"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    من أصل {deliveryData?.summary.totalEligible ?? "—"} طالب
                  </p>
                </div>
                <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-3.5 text-center">
                  <p className="text-xs text-amber-400 font-semibold mb-1">قيد الإرسال</p>
                  <p className="text-2xl font-black text-amber-300 font-mono">
                    {deliveryData?.summary.pendingCount ?? "—"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">في قائمة الانتظار</p>
                </div>
                <div className="bg-slate-900/90 border border-red-500/30 rounded-2xl p-3.5 text-center">
                  <p className="text-xs text-red-400 font-semibold mb-1">فشل الإرسال</p>
                  <p className="text-2xl font-black text-red-300 font-mono">
                    {deliveryData?.summary.failedCount ?? "—"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">خطأ في تيليجرام</p>
                </div>
                <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-3.5 text-center">
                  <p className="text-xs text-indigo-400 font-semibold mb-1">تفاعلوا بالتقييم</p>
                  <p className="text-2xl font-black text-indigo-300 font-mono">
                    {deliveryData?.summary.ratingsReceived ?? "—"}
                  </p>
                  <p className="text-[10px] text-indigo-300/80 mt-0.5">
                    نسبة التفاعل: {deliveryData?.summary.responseRate ?? "0%"}
                  </p>
                </div>
              </div>

              {/* Campaign Picker (if multiple) */}
              {campaigns.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">اختر الحملة:</span>
                  <select
                    value={deliveryCampaignId || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      setDeliveryCampaignId(id);
                      setDeliveryPage(1);
                      fetchDeliveryDetails(id, 1, deliverySearch, deliveryFilterStatus);
                    }}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.sentCount} مرسل)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Search & Filters */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    value={deliverySearch}
                    onChange={(e) => {
                      setDeliverySearch(e.target.value);
                      fetchDeliveryDetails(deliveryCampaignId, 1, e.target.value, deliveryFilterStatus);
                    }}
                    placeholder="بحث باسم الطالب أو الرقم الأكاديمي..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {(
                    [
                      { key: "ALL", label: "الكل" },
                      { key: "SENT", label: "تم الاستلام ✅" },
                      { key: "PENDING", label: "قيد الإرسال ⏳" },
                      { key: "FAILED", label: "فشل ❌" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      onClick={() => {
                        setDeliveryFilterStatus(f.key);
                        setDeliveryPage(1);
                        fetchDeliveryDetails(deliveryCampaignId, 1, deliverySearch, f.key);
                      }}
                      className={`px-3 py-1.5 rounded-xl font-medium transition ${
                        deliveryFilterStatus === f.key
                          ? "bg-indigo-600 text-white font-bold shadow"
                          : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipients Table */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden">
                {deliveryLoading ? (
                  <div className="py-12 flex items-center justify-center text-slate-400 text-xs gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>جاري جلب تفاصيل المستلمين...</span>
                  </div>
                ) : !deliveryData || deliveryData.recipients.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    لا توجد سجلات مطابقة للبحث
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-900/90 text-slate-400 uppercase border-b border-slate-800 text-[11px]">
                        <tr>
                          <th className="py-3 px-4 font-bold">الطالب</th>
                          <th className="py-3 px-4 font-bold">الرقم الأكاديمي</th>
                          <th className="py-3 px-4 font-bold">المجموعة والسكشن</th>
                          <th className="py-3 px-4 font-bold text-center">حالة الاستلام</th>
                          <th className="py-3 px-4 font-bold text-center">التقييم المسجل</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {deliveryData.recipients.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-900/40 transition">
                            <td className="py-3 px-4 text-white font-sans font-semibold">
                              {r.studentFullName}
                            </td>
                            <td className="py-3 px-4 text-slate-300 font-bold">{r.studentAcademicNumber}</td>
                            <td className="py-3 px-4 text-slate-400 font-sans text-[11px]">
                              {r.groupName} — {r.sectionName}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {r.status === "SENT" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/20 text-emerald-400 font-sans font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
                                  <CheckCircle className="w-3 h-3" />
                                  <span>استلم بنجاح</span>
                                </span>
                              ) : r.status === "FAILED" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-red-500/20 text-red-400 font-sans font-bold px-2.5 py-1 rounded-full border border-red-500/30">
                                  <XCircle className="w-3 h-3" />
                                  <span>فشل</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-amber-500/20 text-amber-400 font-sans font-bold px-2.5 py-1 rounded-full border border-amber-500/30 animate-pulse">
                                  <Clock className="w-3 h-3" />
                                  <span>قيد الإرسال</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center font-sans">
                              {r.rating ? (
                                <div className="inline-flex flex-col items-center">
                                  <span className="text-amber-400 font-bold text-xs">
                                    {"⭐".repeat(r.rating)} ({r.rating}/5)
                                  </span>
                                  {r.feedbackMessage && (
                                    <span className="text-[10px] text-slate-400 italic max-w-[150px] truncate mt-0.5">
                                      &quot;{r.feedbackMessage}&quot;
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-600 text-[11px]">لم يقيم بعد</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {deliveryData && deliveryData.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
                  <span>
                    إجمالي المستلمين: <b className="text-white">{deliveryData.pagination.total}</b>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const newPage = Math.max(1, deliveryPage - 1);
                        setDeliveryPage(newPage);
                        fetchDeliveryDetails(deliveryCampaignId, newPage, deliverySearch, deliveryFilterStatus);
                      }}
                      disabled={deliveryPage === 1}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="px-2">
                      {deliveryPage} من {deliveryData.pagination.totalPages}
                    </span>
                    <button
                      onClick={() => {
                        const newPage = Math.min(deliveryData.pagination.totalPages, deliveryPage + 1);
                        setDeliveryPage(newPage);
                        fetchDeliveryDetails(deliveryCampaignId, newPage, deliverySearch, deliveryFilterStatus);
                      }}
                      disabled={deliveryPage === deliveryData.pagination.totalPages}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Low Ratings Management Modal (Request Reasons & Cancel Unreasoned) */}
      {showLowRatingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b101b] border border-slate-700/70 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-rose-950/30 via-slate-900 to-amber-950/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    متابعة وإدارة التقييمات المنخفضة (⭐1 و ⭐2)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    إرسال رسائل للمطالبة بذكر سبب التقييم أو الشكوى، وإلغاء التقييمات غير المبررة
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLowRatingsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center font-mono">
                <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
                  <span className="text-[11px] text-slate-400 font-sans block mb-1">
                    إجمالي ⭐1 و ⭐2
                  </span>
                  <span className="text-lg font-black text-amber-400">
                    {stats?.lowRatingsTotal ?? 0}
                  </span>
                </div>
                <div className="bg-rose-950/20 border border-rose-500/30 p-3 rounded-xl">
                  <span className="text-[11px] text-rose-300 font-sans block mb-1">
                    بدون سبب أو شكوى
                  </span>
                  <span className="text-lg font-black text-rose-400">
                    {stats?.lowRatingsWithoutReason ?? 0}
                  </span>
                </div>
                <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl">
                  <span className="text-[11px] text-emerald-300 font-sans block mb-1">
                    موثقة بشكوى
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    {stats?.lowRatingsWithReason ?? 0}
                  </span>
                </div>
                <div className="bg-blue-950/20 border border-blue-500/30 p-3 rounded-xl">
                  <span className="text-[11px] text-blue-300 font-sans block mb-1">
                    تم إرسال تنبيه مسبقاً
                  </span>
                  <span className="text-lg font-black text-blue-400">
                    {stats?.lowRatingsWarned ?? 0}
                  </span>
                </div>
              </div>

              {/* Action Section 1: Send Reason Request via Telegram */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                  <Send className="w-4 h-4" />
                  <span>1. إرسال طلب كتابة شكوى أو سبب التقييم (عبر تيليجرام)</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  سيتم إرسال رسالة مباشرة لحساب الطالب على التيليجرام تنبهه بضرورة كتابة سبب تقييمه المنخفض أو الشكوى، وتوضح له أنه <b>في حال عدم تقديم سبب سيتم إلغاء تقييمه تلقائياً</b>.
                </p>

                {/* Target Audience Options */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">
                    الشريحة المستهدفة بالإرسال:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLowRatingTarget("UNREASONED")}
                      className={`p-3 rounded-xl text-right text-xs font-semibold border transition ${
                        lowRatingTarget === "UNREASONED"
                          ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold">الطلاب بدون سبب فقط (مستحسن)</span>
                        <span className="bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded-full font-mono text-[10px]">
                          {stats?.lowRatingsWithoutReason ?? 0} طالب
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-normal">
                        من قيّموا بـ 1 أو 2 نجوم ولم يكتبوا أي شكوى أو توضيح
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setLowRatingTarget("ALL_LOW")}
                      className={`p-3 rounded-xl text-right text-xs font-semibold border transition ${
                        lowRatingTarget === "ALL_LOW"
                          ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold">جميع مقيّمي 1 و 2 نجوم</span>
                        <span className="bg-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full font-mono text-[10px]">
                          {stats?.lowRatingsTotal ?? 0} طالب
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-normal">
                        إعادة طلب تفاصيل إضافية من الجميع
                      </p>
                    </button>
                  </div>
                </div>

                {/* Message Customization Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-400">
                      نص الرسالة المرسلة للطالب (يمكنك التعديل عليها):
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setLowRatingCustomMsg(
                          `<b>[جامعة برج العرب التكنولوجية - BATU]</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n⚠️ <b>تنبيه بخصوص تقييمك لمنظومة البصمة</b>\n\nعزيزي الطالب، تم تسجيل تقييمك للمنظومة بدرجة ({rating} من 5).\n\nنحرص دائماً على الاستماع لطلابنا وحل أي مشكلة فوراً، لذا:\n⚠️ <b>يجب كتابة شكوى أو سبب واضح لهذا التقييم في رد على هذه الرسالة الآن.</b>\n\n🚨 <b>تنبيه هام جداً:</b> في حال عدم إرسال سبب التقييم أو كتابة شكوى توضح المشكلة، <b>سيتم إلغاء تقييمك تلقائياً من المنظومة</b>.`
                        )
                      }
                      className="text-[11px] text-amber-400 hover:underline"
                    >
                      استعادة النص الافتراضي
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={lowRatingCustomMsg}
                    onChange={(e) => setLowRatingCustomMsg(e.target.value)}
                    placeholder={`<b>[جامعة برج العرب التكنولوجية - BATU]</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n⚠️ تنبيه: تم استلام تقييمك (نجمة أو نجمتان).\nيجب كتابة شكوى أو سبب للتقييم في رد على هذه الرسالة، وإلا سيتم إلغاء تقييمك تلقائياً.`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition font-sans leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    يمكنك استخدام المتغيرات: &#123;name&#125; لاسم الطالب، و &#123;rating&#125; لرقم التقييم.
                  </p>
                </div>

                {/* Send Button */}
                <button
                  type="button"
                  onClick={handleSendLowRatingReasons}
                  disabled={
                    sendingLowRatingMsg ||
                    (lowRatingTarget === "UNREASONED"
                      ? (stats?.lowRatingsWithoutReason ?? 0) === 0
                      : (stats?.lowRatingsTotal ?? 0) === 0)
                  }
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition active:scale-95"
                >
                  <Send className={`w-4 h-4 ${sendingLowRatingMsg ? "animate-spin" : ""}`} />
                  <span>
                    {sendingLowRatingMsg
                      ? "جاري إرسال التنبيهات للطلاب عبر تيليجرام..."
                      : `إرسال التنبيه الآن لـ ${
                          lowRatingTarget === "UNREASONED"
                            ? stats?.lowRatingsWithoutReason ?? 0
                            : stats?.lowRatingsTotal ?? 0
                        } طالب`}
                  </span>
                </button>
              </div>

              {/* Action Section 2: Cancel Unreasoned Low Ratings */}
              <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <Trash2 className="w-4 h-4" />
                  <span>2. إلغاء التقييمات المنخفضة التي ليس لها سبب (حذف التقييم)</span>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-rose-500/20 text-xs text-slate-300 leading-relaxed space-y-1.5">
                  <p className="font-semibold text-rose-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    تنفيذاً للشرط: &quot;لو محدش كتب سبب يتم إلغاء تقييمه&quot;
                  </p>
                  <p className="text-slate-400">
                    سيتم حذف التقييمات ذات النجمة أو النجمتين التي لم يُكتب لها سبب أو شكوى، مما يعيد رفع متوسط التقييم الإجمالي ويمنع تأثير التقييمات العشوائية غير المبررة.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    id="cancelNotifyCheck"
                    checked={cancelNotifyStudent}
                    onChange={(e) => setCancelNotifyStudent(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-0"
                  />
                  <label htmlFor="cancelNotifyCheck" className="cursor-pointer select-none">
                    إرسال إشعار للطالب على التيليجرام يفيده بإلغاء تقييمه لعدم ذكر السبب أو الشكوى
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCancelConfirmModal(true)}
                  disabled={(stats?.lowRatingsWithoutReason ?? 0) === 0}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 transition active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>
                    إلغاء التقييمات بدون سبب ({stats?.lowRatingsWithoutReason ?? 0} تقييم)
                  </span>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex justify-end">
              <button
                onClick={() => setShowLowRatingsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Batch Cancelling Unreasoned Ratings */}
      {showCancelConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f1422] border-2 border-red-500/60 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-white">
                تأكيد إلغاء {stats?.lowRatingsWithoutReason ?? 0} تقييم منخفض
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                هل أنت متأكد من إلغاء جميع التقييمات (1 و 2 نجوم) التي لم يُذكر لها سبب أو شكوى؟
                <br />
                <span className="text-red-400 font-semibold block mt-1">
                  سيتم حذف هذه التقييمات نهائياً ولن تؤثر بعد الآن على متوسط المنظومة.
                </span>
              </p>
            </div>

            {cancelNotifyStudent && (
              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 text-[11px] text-amber-300 text-center">
                ℹ️ سيتم إرسال رسالة توضيحية للطلاب عبر التيليجرام بإلغاء التقييم
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirmModal(false)}
                disabled={cancellingLowRatings}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleCancelUnreasonedLowRatings}
                disabled={cancellingLowRatings}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/30"
              >
                <Trash2 className={`w-3.5 h-3.5 ${cancellingLowRatings ? "animate-spin" : ""}`} />
                <span>{cancellingLowRatings ? "جاري الإلغاء..." : "نعم، إلغاء التقييمات"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Single Rating Deletion */}
      {ratingToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f1422] border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-white">إلغاء تقييم الطالب</h3>
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-right space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">الطالب:</span>
                  <span className="font-bold text-white">{ratingToDelete.studentFullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">الرقم الأكاديمي:</span>
                  <span className="font-mono text-slate-300">{ratingToDelete.studentAcademicNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">التقييم:</span>
                  <span className="font-bold text-amber-400">
                    {"⭐".repeat(ratingToDelete.rating)} ({ratingToDelete.rating}/5)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                id="singleDeleteNotifyCheck"
                checked={deleteNotifyStudent}
                onChange={(e) => setDeleteNotifyStudent(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-0"
              />
              <label htmlFor="singleDeleteNotifyCheck" className="cursor-pointer select-none">
                إشعار الطالب على التيليجرام بإلغاء هذا التقييم
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRatingToDelete(null)}
                disabled={deletingRating}
                className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleDeleteSingleRating}
                disabled={deletingRating}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/30"
              >
                <Trash2 className={`w-3.5 h-3.5 ${deletingRating ? "animate-spin" : ""}`} />
                <span>{deletingRating ? "جاري الإلغاء..." : "تأكيد الإلغاء"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
