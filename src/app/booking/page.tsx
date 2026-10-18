"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  User,
  Users,
  CheckCircle2,
  AlertTriangle,
  Ticket,
  Clock,
  ArrowRight,
  Send,
  Sparkles,
  MapPin,
  RefreshCw,
  ExternalLink,
  KeyRound,
  Settings,
} from "lucide-react";

export default function BookingPage() {
  const [academicNumberInput, setAcademicNumberInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [telegramResending, setTelegramResending] = useState(false);
  const [telegramResentMsg, setTelegramResentMsg] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<any>(null);

  const handleResendTelegram = async () => {
    if (!lookupResult?.student?.academicNumber) return;
    try {
      setTelegramResending(true);
      setTelegramResentMsg(null);
      setError(null);

      const res = await fetch("/api/bookings/resend-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicNumber: lookupResult.student.academicNumber,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "تعذر إرسال الإشعار إلى التيليجرام");
        return;
      }

      setTelegramResentMsg("تم إرسال تفاصيل وموعد دورك إلى التيليجرام بنجاح!");
    } catch (err: any) {
      setError(err?.message || "حدث خطأ أثناء إرسال الرسالة");
    } finally {
      setTelegramResending(false);
    }
  };

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!academicNumberInput.trim()) {
      setError("يرجى إدخال الرقم الأكاديمي أولاً");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setBookingSuccess(null);

      const res = await fetch(
        `/api/bookings/student-lookup?academicNumber=${encodeURIComponent(
          academicNumberInput.trim()
        )}`
      );
      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || "تعذر التحقق من الرقم الأكاديمي");
        setLookupResult(null);
        return;
      }

      setLookupResult(json.data);
    } catch (err: any) {
      setError(err?.message || "حدث خطأ في الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBooking = async () => {
    if (!lookupResult?.student?.academicNumber) return;

    try {
      setBookingLoading(true);
      setError(null);

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicNumber: lookupResult.student.academicNumber,
          bookingWindowId: lookupResult.windowId,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || "فشل إتمام الحجز");
        return;
      }

      setBookingSuccess(json.data);
      // Re-fetch student lookup to update existing booking state
      await handleLookup();
    } catch (err: any) {
      setError(err?.message || "حدث خطأ أثناء حجز الدور");
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 text-slate-100 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-2xl w-full space-y-8 relative z-10">
        {/* Top Quick Navigation */}
        <div className="flex items-center justify-between pb-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>الرئيسية</span>
          </Link>

          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-white transition px-3.5 py-1.5 rounded-xl bg-cyan-950/40 border border-cyan-800/40 hover:bg-cyan-900/40 shadow-sm"
          >
            <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
            <span>إعدادات الحساب وكلمة المرور</span>
          </Link>
        </div>

        {/* Header Title */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-white p-2 shadow-xl shadow-blue-500/20 border border-slate-700 flex items-center justify-center">
            <img
              src="/images/batu-logo.png"
              alt="جامعة برج العرب التكنولوجية"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-mono">
            <Ticket className="w-3.5 h-3.5 text-blue-400" />
            <span>نظام حجز الأدوار البيومترية المعتمد</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            حجز دور بصمة الوجه بالرقم الأكاديمي
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            أدخل رقمك الأكاديمي للتحقق من بياناتك ومطابقة سكشنك، ثم اضغط على زر الحجز لتصلك تفاصيل دورك فوراً على التيليجرام.
          </p>
        </div>

        {/* Step 1: Academic Number Input Form */}
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
          <form onSubmit={handleLookup} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">
                الرقم الأكاديمي للطالب:
              </label>

              <div className="relative">
                <input
                  type="text"
                  required
                  value={academicNumberInput}
                  onChange={(e) => setAcademicNumberInput(e.target.value)}
                  placeholder="أدخل الرقم الأكاديمي المسجل..."
                  className="w-full px-4 py-3.5 pl-11 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>جاري التحقق من السجلات...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>تحقق من البيانات واستعلام الموعد</span>
                </>
              )}
            </button>
          </form>

          {/* Error Message Alert */}
          {error && (
            <div className="p-5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs sm:text-sm space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed font-medium">{error}</div>
              </div>
              {error.includes("غير مسجل") && (
                <div className="pt-2 border-t border-rose-900/60 flex justify-end">
                  <Link
                    href="/register"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition"
                  >
                    <span>الانتقال إلى صفحة تسجيل بيانات الطالب</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Verified Student Card & Booking Trigger */}
          {lookupResult && (
            <div className="space-y-6 pt-4 border-t border-slate-800 animate-in fade-in slide-in-from-top-3">
              {/* Student Verified Profile Header */}
              <div className="bg-[#0b101d] rounded-2xl p-5 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-white">
                        {lookupResult.student.fullName}
                      </h3>
                      <div className="text-xs text-slate-400 font-mono">
                        الرقم الأكاديمي: {lookupResult.student.academicNumber}
                      </div>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    بيانات مطابقة
                  </span>
                </div>

                {/* Academic Metadata Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800/80">
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                    <span className="text-slate-400 block mb-0.5">المجموعة الدراسية:</span>
                    <span className="font-bold text-slate-200">{lookupResult.student.groupName}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                    <span className="text-slate-400 block mb-0.5">السكشن الأكاديمي:</span>
                    <span className="font-bold text-blue-400 font-mono">{lookupResult.student.sectionName}</span>
                  </div>
                </div>

                {/* Telegram Connection Badge */}
                <div className="flex items-center justify-between text-xs pt-2">
                  <span className="text-slate-400">حالة ربط التيليجرام:</span>
                  {lookupResult.student.hasTelegram ? (
                    <span className="inline-flex items-center gap-1.5 text-cyan-400 font-mono font-bold bg-cyan-950/40 px-2.5 py-1 rounded-xl border border-cyan-800/40">
                      <Send className="w-3.5 h-3.5" />
                      <span>مرتبط ({lookupResult.student.telegramUsername || "Active"})</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-400 font-bold bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/30">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>غير مرتبط بعد</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Mandatory Telegram Linking Guard */}
              {!lookupResult.student.hasTelegram ? (
                <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-6 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                    <Send className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-base text-amber-300">
                      يجب ربط حساب التيليجرام الخاص بك أولاً قبل حجز الدور!
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
                      النظام يتطلب ربط حساب التيليجرام الخاص بك لتلقي رقم دورك، وتنبيه اقتراب موعدك (عندما يتبقى 10 أدوار قبلك)، ورسائل النداء المباشرة.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <a
                      href={lookupResult.student.telegramDeepLink || "https://t.me/batu_face_id_bot"}
                      target="_blank"
                      rel="noreferrer"
                      className="py-3 px-6 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-sky-600/30 transition flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>اضغط هنا لربط حساب التيليجرام الخاص بك</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleLookup()}
                      disabled={loading}
                      className="py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs transition flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
                      <span>تحقق من إتمام الربط</span>
                    </button>
                  </div>
                </div>
              ) : lookupResult.isFingerprintActivated ? (
                /* Case A: Student has already completed fingerprint activation */
                <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-2xl p-5 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="font-extrabold text-base text-emerald-300">
                    تم توثيق وتفعيل بصمة الوجه الخاصة بك رسمياً!
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    تم اعتماد حضورك وتسجيل بصمتك مسبقاً لدى شؤون الطلاب، لا حاجة لحجز دور جديد.
                  </p>
                  {lookupResult.activation && (
                    <div className="text-[11px] text-slate-400 pt-1">
                      تم الاعتماد بواسطة: <b className="text-slate-200">{lookupResult.activation.staffName}</b> • {lookupResult.activation.activatedAt}
                    </div>
                  )}
                </div>
              ) : lookupResult.existingBooking ? (
                /* Case B: Student has an active confirmed booking */
                <div className="bg-gradient-to-r from-blue-950/50 via-slate-900 to-indigo-950/50 border border-blue-500/40 rounded-2xl p-6 text-center space-y-5">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-bold text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>طابور حي ومتحرك</span>
                    </div>

                    {/* Desk Badge */}
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs text-slate-300 font-medium">الشباك المخصص:</span>
                      {lookupResult.existingBooking.desk === "D" ? (
                        <span className="px-4 py-1.5 rounded-xl text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm font-mono flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                          <span>شباك D</span>
                        </span>
                      ) : (
                        <span className="px-4 py-1.5 rounded-xl text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-mono flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                          <span>شباك T</span>
                        </span>
                      )}
                    </div>

                    {/* Prominent Unique Ticket Number */}
                    <div className="py-1">
                      <span className="text-xs text-blue-300 font-bold uppercase tracking-wider block mb-1">
                        رقم تذكرة الحجز الرسمية الثابتة
                      </span>
                      <div className="text-5xl sm:text-6xl font-black text-amber-400 font-mono py-1 drop-shadow-md">
                        #{lookupResult.existingBooking.formattedTicketNumber || lookupResult.existingBooking.formattedQueueNumber}
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                        رقم التذكرة فريد وخاص بك: <b className="text-white font-mono">#{lookupResult.existingBooking.formattedTicketNumber || lookupResult.existingBooking.formattedQueueNumber}</b>
                      </div>
                    </div>
                  </div>

                  {/* Turn Status Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-right">
                    <div className="bg-[#0b101d] p-3.5 rounded-xl border border-slate-800 text-xs space-y-1">
                      <div className="text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        <span>ترتيبك على شباك {lookupResult.existingBooking.desk || "T"}:</span>
                      </div>
                      <div className="text-sm font-black text-cyan-300 font-mono">
                        {(lookupResult.existingBooking.deskAhead ?? lookupResult.existingBooking.peopleAhead) === 0 ? (
                          <span className="text-emerald-400">أنت التالي مباشرة! (#001)</span>
                        ) : (
                          <span>الدور رقم #{lookupResult.existingBooking.formattedDeskTurn || lookupResult.existingBooking.formattedCurrentTurn}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        باقي قبلك على هذا الشباك: <b className="text-cyan-400 font-mono">{lookupResult.existingBooking.deskAhead ?? lookupResult.existingBooking.peopleAhead}</b> طلاب
                      </div>
                    </div>

                    <div className="bg-[#0b101d] p-3.5 rounded-xl border border-slate-800 text-xs space-y-1">
                      <div className="text-slate-400 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-400" />
                        <span>ترتيبك في انتظار الكلية العام:</span>
                      </div>
                      <div className="text-sm font-black text-indigo-300 font-mono">
                        الدور رقم #{lookupResult.existingBooking.formattedGlobalTurn || lookupResult.existingBooking.formattedTicketNumber}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        إجمالي الطلاب قبلك: <b className="text-indigo-300 font-mono">{lookupResult.existingBooking.globalAhead ?? lookupResult.existingBooking.peopleAhead}</b> طلاب
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 flex items-center justify-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>الواحة — مبنى الشؤون (شباك بصمة الوجه)</span>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResendTelegram}
                      disabled={telegramResending}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs shadow-md shadow-sky-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {telegramResending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          <span>جاري الإرسال إلى التيليجرام...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 text-white" />
                          <span>إرسال تفاصيل الدور إلى التيليجرام الآن</span>
                        </>
                      )}
                    </button>
                    {telegramResentMsg && (
                      <div className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 animate-in fade-in">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>{telegramResentMsg}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : !lookupResult.isWindowOpen ? (
                /* Case C: Booking Window is NOT open for this section */
                <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-5 text-center space-y-2.5">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
                    <Clock className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-sm text-amber-300">
                    لم يتم تفعيل وقت البصمة للسكشن بتاعك
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-md mx-auto">
                    يرجى الانتظار، ستصلك رسالة تنبيهية فورية على التيليجرام فور قيام الإدارة بفتح الحجز لسكشنك.
                  </p>
                </div>
              ) : (
                /* Case D: Eligible and Ready to Book! */
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-500/30 text-xs text-blue-200 leading-relaxed flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-blue-400 shrink-0" />
                    <span>
                      الحجز متاح ومفتوح لسكشنك الآن. عند الضغط على زر الحجز، سيتم حجز رقم دورك تلقائياً وبث إشعار فوري بحالتك على التيليجرام.
                    </span>
                  </div>

                  <button
                    onClick={handleCreateBooking}
                    disabled={bookingLoading}
                    className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-extrabold text-base shadow-xl shadow-emerald-600/30 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    {bookingLoading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>جاري تسجيل وحجز الدور وإرسال التيليجرام...</span>
                      </>
                    ) : (
                      <>
                        <Ticket className="w-5 h-5" />
                        <span>احجز دورك الآن</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Links & Footer Info */}
        <div className="text-center space-y-2 text-xs text-slate-500">
          <p>
            هل لم تقم بتسجيل بياناتك الأكاديمية بعد؟{" "}
            <Link href="/register" className="text-blue-400 hover:underline font-bold inline-flex items-center gap-1">
              <span>تسجيل طالب جديد</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </p>
          <p>
            تصل جميع إشعارات الأدوار وأوقات الحضور عبر البوت الرسمي{" "}
            <a
              href="https://t.me/batu_face_id_bot"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:underline font-mono"
            >
              @batu_face_id_bot
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
