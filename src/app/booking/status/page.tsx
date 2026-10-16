"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import {
  RefreshCw,
  Search,
  Ticket,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  Clock,
  User,
  Send,
  Radio,
  Sparkles,
} from "lucide-react";

function BookingStatusContent() {
  const searchParams = useSearchParams();
  const urlAcademicNumber = searchParams?.get("academicNumber") || "";

  const [academicNumber, setAcademicNumber] = useState(urlAcademicNumber);
  const [loading, setLoading] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const fetchStatus = async (academicNum: string, isManual = false) => {
    if (!academicNum.trim()) return;

    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await fetch(`/api/bookings/status?academicNumber=${encodeURIComponent(academicNum.trim())}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || "فشل جلب حالة الدور");
        setStatusData(null);
        return;
      }

      setStatusData(json.data);
      setSearched(true);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء الاتصال بالخادم");
      setStatusData(null);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (urlAcademicNumber) {
      setAcademicNumber(urlAcademicNumber);
      fetchStatus(urlAcademicNumber);
    }
  }, [urlAcademicNumber]);

  // Auto-refresh every 15 seconds if booking is active
  useEffect(() => {
    if (!academicNumber || !statusData?.hasBooking) return;

    const interval = setInterval(() => {
      fetchStatus(academicNumber, true);
    }, 15000);

    return () => clearInterval(interval);
  }, [academicNumber, statusData?.hasBooking]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!academicNumber.trim()) {
      setError("يرجى إدخال الرقم الأكاديمي أولاً");
      return;
    }
    fetchStatus(academicNumber);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "WAITING":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            <span>في الانتظار</span>
          </span>
        );
      case "CALLED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30 animate-pulse">
            <Volume2 className="w-3 h-3" />
            <span>تم النداء على دورك الآن</span>
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
            <span>قيد التسجيل بالبصمة</span>
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            <span>تم التفعيل بنجاح</span>
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30">
            <span>دور ملغي</span>
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
              LIVE QUEUE RADAR
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-100">شاشة متابعة الطابور المباشرة</h1>
          <p className="text-xs text-slate-400">متابعة لحظية لحالة حجزك وترتيب دورك بالرقم الأكاديمي</p>
        </div>
        {searched && (
          <button
            onClick={() => fetchStatus(academicNumber, true)}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
            <span>{refreshing ? "تحديث..." : "تحديث"}</span>
          </button>
        )}
      </div>

      {/* Academic Number Lookup Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-xl">
        <form onSubmit={handleSearch} className="space-y-2">
          <label className="block text-xs font-bold text-slate-300">
            أدخل الرقم الأكاديمي لمتابعة دورك:
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={academicNumber}
                onChange={(e) => setAcademicNumber(e.target.value)}
                placeholder="أدخل الرقم الأكاديمي..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
                dir="ltr"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
            >
              {loading ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span>استعلام</span>
            </button>
          </div>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-950/40 rounded-2xl border border-red-500/30 p-4 text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-red-300 font-semibold text-xs sm:text-sm">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Status Result View */}
      {searched && !error && (
        <>
          {!statusData?.hasBooking ? (
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-8 text-center space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto border border-slate-700">
                <Ticket className="w-6 h-6 text-slate-400" />
              </div>
              <h2 className="text-lg font-bold text-white">ليس لديك حجز نشط حالياً</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                يمكنك حجز دورك الآن مباشرة برقمك الأكاديمي عند فتح الحجز للسكشن الخاص بك.
              </p>
              <div className="pt-2">
                <Link
                  href="/booking"
                  className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30"
                >
                  <Ticket className="w-4 h-4" />
                  <span>الانتقال لصفحة الحجز</span>
                </Link>
              </div>
            </div>
          ) : (
            /* Active Booking Card */
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-xl">
              {/* Top Banner with status badge */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">حالة الحجز الحالية</span>
                  {getStatusBadge(statusData.status)}
                </div>
                <div className="text-left">
                  <span className="text-[11px] text-slate-400 block mb-1">السكشن الأكاديمي</span>
                  <span className="text-xs sm:text-sm font-bold text-white font-mono">{statusData.sectionName}</span>
                </div>
              </div>

              {/* Turn called special alert */}
              {statusData.status === "CALLED" && (
                <div className="p-4 rounded-xl bg-blue-950/60 border border-blue-500/40 text-blue-200 text-center font-bold text-xs sm:text-sm animate-pulse space-y-1">
                  <div className="flex items-center justify-center gap-2 text-base font-extrabold text-blue-300">
                    <Volume2 className="w-5 h-5 text-blue-400" />
                    <span>حان دورك الآن!</span>
                  </div>
                  <p className="text-xs font-normal text-slate-300">
                    يرجى التوجه فوراً إلى شباك بصمة الوجه بمعمل الحاسب الآلي لإتمام تسجيل بصمتك.
                  </p>
                </div>
              )}

              {/* Dynamic Queue Number Display */}
              <div className="text-center py-6 px-4 bg-slate-950 rounded-2xl text-white space-y-3 border border-amber-500/30 shadow-inner relative overflow-hidden">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>طابور حي ومتحرك</span>
                </div>

                <span className="text-xs text-amber-400 font-bold uppercase tracking-wider block">
                  دورك الحالي في الطابور الآن
                </span>

                <div className="text-6xl sm:text-7xl font-black font-mono tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500">
                  #{statusData.formattedCurrentTurn || statusData.formattedQueueNumber}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
                  <span className="bg-slate-900 px-3 py-1 rounded-xl border border-slate-800 text-slate-300">
                    رقم التذكرة عند الحجز: <b className="text-white font-mono">#{statusData.formattedTicketNumber || statusData.formattedQueueNumber}</b>
                  </span>
                  <span className="bg-slate-900 px-3 py-1 rounded-xl border border-slate-800 text-slate-300">
                    باقي قبلك في الانتظار: <b className="text-cyan-400 font-mono">{statusData.studentsAhead}</b> طلاب
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 pt-1">
                  تاريخ ووقت الحجز: {formatCairoDateTime(statusData.bookedAt)}
                </p>
              </div>

              {/* Dynamic Queue Progression Notice */}
              <div className="bg-blue-950/30 rounded-xl p-3.5 border border-blue-500/20 text-xs text-blue-200 flex items-center gap-2.5">
                <Radio className="w-4 h-4 text-blue-400 shrink-0 animate-pulse" />
                <span className="leading-relaxed">
                  يتقدم رقم دورك تلقائياً للأمام مع كل طالب ينتهي من عمل البصمة في الطابور حتى تصل للرقم 1.
                </span>
              </div>

              {/* Student Profile Info */}
              <div className="text-xs space-y-2.5 text-slate-400 border-t border-slate-800 pt-4">
                <div className="flex justify-between items-center">
                  <span>اسم الطالب:</span>
                  <span className="font-semibold text-white">{statusData.studentName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>الرقم الأكاديمي:</span>
                  <span className="font-mono font-semibold text-white">{statusData.academicNumber}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>ربط التيليجرام:</span>
                  <span>
                    {statusData.isTelegramLinked ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>مربوط ومفعل (@batu_face_id_bot)</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 font-bold">غير مربوط</span>
                    )}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                يتم تحديث هذه الشاشة تلقائياً كل 15 ثانية. ستصلك رسالة تيليجرام فورية عند اقتراب دورك (عند متبقي 10 أشخاص).
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BookingStatusPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm font-bold">جاري تحميل حالة الدور...</div>}>
      <BookingStatusContent />
    </Suspense>
  );
}
