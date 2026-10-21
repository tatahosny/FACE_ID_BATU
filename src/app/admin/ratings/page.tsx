"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

interface Rating {
  id: string;
  rating: number;
  message: string | null;
  type: "SERVICE" | "ISSUE";
  createdAt: string;
  requestCampaignId: string | null;
  studentId: string;
  studentFullName: string;
  studentAcademicNumber: string;
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
}

interface Campaign {
  id: string;
  title: string;
  targetType: string;
  status: string;
  sentCount: number;
  failedCount: number;
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/ratings?page=${page}&limit=15`);
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
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        setStatusMsg({
          text: `تم الإرسال! ${json.data.sentCount} طالب استلم طلب التقييم`,
          type: "success",
        });
        setShowForm(false);
        setFormTitle("");
        setFormTargetType("ALL");
        setFormSelectedStudent(null);
        setFormStudentSearch("");
        await fetchData();
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
        <div className="flex items-center gap-2">
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

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="إجمالي التقييمات" value={stats?.totalRatings ?? "—"} icon={Star} color="bg-amber-500/20 text-amber-400" />
        <StatCard label="متوسط التقييم" value={avgForDisplay} sub="من 5 نجوم" icon={TrendingUp} color="bg-blue-500/20 text-blue-400" />
        <StatCard label="بلاغات مشاكل" value={stats?.issueCount ?? "—"} icon={AlertTriangle} color="bg-red-500/20 text-red-400" />
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
                  <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    c.status === "SENT" ? "bg-emerald-500/20 text-emerald-400" :
                    c.status === "FAILED" ? "bg-red-500/20 text-red-400" : "bg-slate-700 text-slate-400"
                  }`}>
                    {c.status === "SENT" ? "مرسل" : c.status === "FAILED" ? "فشل" : "معلق"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ratings Table */}
      <div className="bg-[#0d1322]/80 border border-slate-800/60 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/60 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-400" />
            ردود التقييمات ({pagination?.total ?? 0})
          </h2>
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition">
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 px-2">{page} / {pagination.totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition">
                <ChevronLeft className="w-4 h-4" />
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
            <p className="text-sm">لا توجد تقييمات بعد</p>
            <p className="text-xs text-slate-600 mt-1">أرسل استبياناً للطلاب لبدء جمع التقييمات</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {ratings.map((r) => (
              <div key={r.id} className="px-5 py-4 flex items-start gap-4 hover:bg-slate-900/30 transition">
                <div className="flex-shrink-0 pt-0.5">
                  <StarDisplay rating={r.rating} />
                  <p className="text-[10px] text-slate-500 mt-1 text-center">{r.rating}/5</p>
                </div>
                <div className="flex-1 min-w-0">
                  {r.message && (
                    <p className="text-sm text-slate-300 mb-1.5 leading-relaxed">
                      {r.type === "ISSUE" && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full mr-1 font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          مشكلة
                        </span>
                      )}
                      &quot;{r.message}&quot;
                    </p>
                  )}
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-slate-600" />
                      {r.studentFullName}
                    </span>
                    <span className="text-slate-700">•</span>
                    <span>{r.studentAcademicNumber}</span>
                    <span className="text-slate-700">•</span>
                    <span>{r.groupName} / {r.sectionName}</span>
                    <span className="text-slate-700">•</span>
                    <span>
                      {new Date(r.createdAt).toLocaleString("ar-EG", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
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
    </div>
  );
}
