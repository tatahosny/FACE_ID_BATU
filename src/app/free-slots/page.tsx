"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Users,
  Sparkles,
  ArrowRight,
  Send,
  Ticket,
  ChevronRight,
  Info,
  RefreshCw,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { FREE_SLOT_PERIODS } from "@/lib/constants/academic";

interface DaySetting {
  id: string;
  dayName: string;
  dayIndex: number;
  isOpen: boolean;
  academicYear: string;
}

interface BookedSlot {
  id: string;
  academicYear: string;
  specialization: string;
  groupId: string;
  groupName: string;
  sectionId: string;
  sectionName: string;
  sectionCode: string;
  delegateStudentId: string | null;
  delegateName: string;
  dayName: string;
  periodIndex: number;
  periodName: string;
  startTime: string;
  endTime: string;
  notes?: string | null;
  createdAt: string;
}

export default function FreeSlotsPage() {
  // State
  const [activeSpec, setActiveSpec] = useState<"سوفت وير" | "نيتورك">("سوفت وير");
  const [days, setDays] = useState<DaySetting[]>([]);
  const [slots, setSlots] = useState<BookedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Authenticated Delegate Session
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [delegateStudent, setDelegateStudent] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Delegate Registration Form Modal / Inline State
  const [isRegistering, setIsRegistering] = useState(false);
  const [regForm, setRegForm] = useState({
    fullName: "",
    academicNumber: "",
    nationalId: "",
    specialization: "سوفت وير" as "سوفت وير" | "نيتورك",
    groupId: "",
    sectionId: "",
  });
  const [regGroups, setRegGroups] = useState<any[]>([]);
  const [regSections, setRegSections] = useState<any[]>([]);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regSuccessData, setRegSuccessData] = useState<{
    student: any;
    telegramDeepLink: string;
  } | null>(null);
  const [isTelegramLinked, setIsTelegramLinked] = useState(false);

  // Delegate Login & Registration Modal / Inline State
  const [authMode, setAuthMode] = useState<"LOGIN" | "REGISTER">("LOGIN");
  const [loginAcademicNumber, setLoginAcademicNumber] = useState("");
  const [loginNationalId, setLoginNationalId] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Quick lookup with Academic Number if delegate already registered
  const [lookupNumber, setLookupNumber] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  // Load Free Slots & Days data
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/free-slots?academicYear=${encodeURIComponent("الفرقة الثالثة")}&specialization=${encodeURIComponent(activeSpec)}`);
      const json = await res.json();
      if (json.success) {
        setDays(json.data.days || []);
        setSlots(json.data.slots || []);
      }
    } catch (err) {
      console.error("Failed to load slots data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeSpec]);

  // Check Current Session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        setCheckingAuth(true);
        const res = await fetch("/api/auth/me");
        const json = await res.json();
        if (json.success && json.data?.user) {
          setSessionUser(json.data.user);
          if (json.data.user.isDelegate || json.data.user.role === "SUPER_ADMIN") {
            setDelegateStudent(json.data.user);
            if (json.data.user.specialization === "نيتورك") {
              setActiveSpec("نيتورك");
            }
          }
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setCheckingAuth(false);
      }
    }
    checkSession();
  }, []);

  // Load Groups for registration form
  useEffect(() => {
    async function loadRegGroups() {
      try {
        const res = await fetch(`/api/groups?academicYear=${encodeURIComponent("الفرقة الثالثة")}&specialization=${encodeURIComponent(regForm.specialization)}`);
        const json = await res.json();
        if (json.success && json.data.groups) {
          setRegGroups(json.data.groups);
        }
      } catch (err) {
        console.error("Failed to load groups:", err);
      }
    }
    loadRegGroups();
  }, [regForm.specialization]);

  // Load Sections when group changes in registration form
  useEffect(() => {
    if (!regForm.groupId) {
      setRegSections([]);
      setRegForm((prev) => ({ ...prev, sectionId: "" }));
      return;
    }
    async function loadSections(gId: string) {
      try {
        const res = await fetch(`/api/sections?groupId=${gId}`);
        const json = await res.json();
        if (json.success && json.data.sections) {
          setRegSections(json.data.sections);
        }
      } catch (err) {
        console.error("Failed to load sections:", err);
      }
    }
    loadSections(regForm.groupId);
  }, [regForm.groupId]);

  // Poll for delegate telegram link status after registering
  useEffect(() => {
    if (!regSuccessData?.student?.id || isTelegramLinked) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/students/link-status?studentId=${regSuccessData.student.id}`);
        const json = await res.json();
        if (json.success && json.data?.isLinked) {
          setIsTelegramLinked(true);
          setDelegateStudent({
            ...regSuccessData.student,
            isDelegate: true,
          });
          clearInterval(interval);
          setFeedback({
            message: "تم توثيق ربط التيليجرام بنجاح! يمكنك الآن اختيار فترات سكشنك بالجدول.",
            type: "success",
          });
          setIsRegistering(false);
          fetchData();
        }
      } catch (err) {
        console.error("Link check failed:", err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [regSuccessData?.student?.id, isTelegramLinked]);

  // Handle Delegate Registration Submit
  const handleDelegateRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!regForm.fullName.trim() || !regForm.academicNumber.trim() || !regForm.nationalId.trim()) {
      setFeedback({ message: "يرجى ملء جميع الحقول المطلوبة", type: "error" });
      return;
    }
    if (regForm.nationalId.trim().length !== 14) {
      setFeedback({ message: "الرقم القومي يجب أن يتكون من 14 رقماً", type: "error" });
      return;
    }
    if (!regForm.groupId || !regForm.sectionId) {
      setFeedback({ message: "يرجى اختيار المجموعة والسكشن التابع لك", type: "error" });
      return;
    }

    try {
      setRegSubmitting(true);
      const res = await fetch("/api/delegate/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: regForm.fullName,
          academicNumber: regForm.academicNumber,
          nationalId: regForm.nationalId,
          academicYear: "الفرقة الثالثة",
          specialization: regForm.specialization,
          groupId: regForm.groupId,
          sectionId: regForm.sectionId,
          subSection: "A",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل تسجيل بيانات المندوب", type: "error" });
        return;
      }

      setRegSuccessData({
        student: json.data.student,
        telegramDeepLink: json.data.telegramDeepLink,
      });
      setActiveSpec(regForm.specialization);
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setRegSubmitting(false);
    }
  };

  // Delegate Login with Academic Number + National ID (as password)
  const handleDelegateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanAcademic = loginAcademicNumber.trim();
    const cleanNational = loginNationalId.trim();

    if (!cleanAcademic || !cleanNational) {
      setFeedback({ message: "يرجى إدخال الرقم الأكاديمي والرقم القومي ككلمة مرور", type: "error" });
      return;
    }

    if (cleanNational.length !== 14) {
      setFeedback({ message: "الرقم القومي (كلمة المرور) يجب أن يتكون من 14 رقماً", type: "error" });
      return;
    }

    try {
      setLoginLoading(true);
      const res = await fetch("/api/delegate/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicNumber: cleanAcademic,
          nationalId: cleanNational,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json.code === "STUDENT_NOT_FOUND") {
          setAuthMode("REGISTER");
          setRegForm((prev) => ({ ...prev, academicNumber: cleanAcademic, nationalId: cleanNational }));
          setFeedback({
            message: "لم يتم العثور على طالب مسجل بهذا الرقم الأكاديمي. تم نقلك لنموذج تسجيل مندوب جديد لاستكمال بياناتك.",
            type: "error",
          });
        } else {
          setFeedback({ message: json.error || "فشل تسجيل الدخول", type: "error" });
        }
        return;
      }

      const st = json.data.student;
      setDelegateStudent(st);
      if (st.specialization === "نيتورك") {
        setActiveSpec("نيتورك");
      }

      if (!json.data.isTelegramLinked && json.data.telegramDeepLink) {
        setRegSuccessData({
          student: st,
          telegramDeepLink: json.data.telegramDeepLink,
        });
        setIsTelegramLinked(false);
      } else {
        setIsTelegramLinked(true);
        setIsRegistering(false);
        setFeedback({
          message: `مرحباً بك يا مندوب: ${st.fullName} (${st.sectionName} - ${st.groupName})! يمكنك الآن اختيار فترات سكشنك بالجدول.`,
          type: "success",
        });
      }
      fetchData();
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setLoginLoading(false);
    }
  };

  // Quick lookup by academic number fallback
  const handleQuickLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupNumber.trim()) return;
    try {
      setLookupLoading(true);
      setFeedback(null);
      const res = await fetch(`/api/bookings/student-lookup?query=${encodeURIComponent(lookupNumber.trim())}`);
      const json = await res.json();
      if (!res.ok || !json.success || !json.data?.student) {
        setFeedback({ message: "لم يتم العثور على طالب مسجل بهذا الرقم. يرجى تسجيل بيانات المندوب أولاً.", type: "error" });
        return;
      }
      const st = json.data.student;
      setDelegateStudent(st);
      if (st.specialization === "نيتورك") {
        setActiveSpec("نيتورك");
      }
      setFeedback({ message: `مرحباً بك يا مندوب: ${st.fullName}`, type: "success" });
    } catch (err: any) {
      setFeedback({ message: err.message || "فشل التحقق من الرقم", type: "error" });
    } finally {
      setLookupLoading(false);
    }
  };

  // Delegate's currently booked slots count for their section
  const mySectionId = delegateStudent?.sectionId;
  const mySectionSlots = slots.filter((s) => s.sectionId === mySectionId);
  const mySlotsCount = mySectionSlots.length;
  const isSuperAdmin = sessionUser?.role === "SUPER_ADMIN";

  // Toggle/Reserve Slot
  const handleSlotClick = async (dayName: string, periodIndex: number) => {
    setFeedback(null);

    // If day is closed
    const daySetting = days.find((d) => d.dayName === dayName);
    if (!daySetting?.isOpen && !isSuperAdmin) {
      setFeedback({ message: `يوم (${dayName}) مغلق حالياً من قِبل إدارة الكلية.`, type: "error" });
      return;
    }

    // Check if slot already taken
    const existingSlot = slots.find((s) => s.dayName === dayName && s.periodIndex === periodIndex);

    // If already booked by MY section: Offer to release / cancel
    if (existingSlot && existingSlot.sectionId === mySectionId) {
      if (confirm(`هل تريد إلغاء حجز ${existingSlot.periodName} يوم (${dayName}) لسكشنك؟`)) {
        try {
          setActionLoading(`${dayName}-${periodIndex}`);
          const res = await fetch(`/api/free-slots?id=${existingSlot.id}`, { method: "DELETE" });
          const json = await res.json();
          if (!res.ok || !json.success) {
            setFeedback({ message: json.error || "فشل إلغاء الحجز", type: "error" });
            return;
          }
          setFeedback({ message: "تم إلغاء حجز الفترة بنجاح وإتاحتها مجدداً", type: "success" });
          fetchData();
        } catch (err: any) {
          setFeedback({ message: err.message || "حدث خطأ أثناء الإلغاء", type: "error" });
        } finally {
          setActionLoading(null);
        }
      }
      return;
    }

    // If already booked by ANOTHER section
    if (existingSlot && existingSlot.sectionId !== mySectionId) {
      setFeedback({
        message: `هذه الفترة محجوزة بالفعل لـ (${existingSlot.sectionName} - المندوب: ${existingSlot.delegateName}).`,
        type: "error",
      });
      return;
    }

    // Not booked yet: Require verified delegate
    if (!delegateStudent || !mySectionId) {
      setIsRegistering(true);
      setFeedback({
        message: "يرجى تسجيل بياناتك كمندوب للسكشن أولاً حتى تتمكن من حجز الفترات المتاحة.",
        type: "error",
      });
      return;
    }

    // Check limit: Max 2 slots per section
    if (mySlotsCount >= 2 && !isSuperAdmin) {
      setFeedback({
        message: "لقد وصلت إلى الحد الأقصى المسموح به لسكشنك (فترتان فقط). لإلغاء إحداهما اضغط على الفترة المحجوزة مسبقاً لسكشنك.",
        type: "error",
      });
      return;
    }

    // Proceed with booking
    try {
      setActionLoading(`${dayName}-${periodIndex}`);
      const res = await fetch("/api/free-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          academicYear: "الفرقة الثالثة",
          specialization: activeSpec,
          groupId: delegateStudent.groupId,
          sectionId: mySectionId,
          delegateStudentId: delegateStudent.id,
          delegateName: delegateStudent.fullName,
          dayName,
          periodIndex,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل حجز الفترة", type: "error" });
        return;
      }

      setFeedback({
        message: `تم حجز الفترة بنجاح لسكشنك (${delegateStudent.sectionName || "السكشن"})!`,
        type: "success",
      });
      fetchData();
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ أثناء الحجز", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-cyan-600 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition flex items-center gap-1.5 text-xs font-bold"
            >
              <ArrowRight className="w-4 h-4" />
              <span>الرئيسية</span>
            </Link>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>/</span>
              <span className="text-cyan-400 font-bold">مواعيد فراغ السكاشن • الفرقة الثالثة</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/schedules"
              className="px-4 py-2 rounded-xl bg-purple-950/40 border border-purple-800/40 text-purple-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5"
            >
              <Calendar className="w-4 h-4" />
              <span>جدول المواعيد العام</span>
            </Link>

            <Link
              href="/booking"
              className="px-4 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5"
            >
              <Ticket className="w-4 h-4" />
              <span>حجز الدور</span>
            </Link>
          </div>
        </div>

        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950/80 border border-slate-800/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
          <div className="absolute top-0 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white p-2 shadow-xl shadow-cyan-500/20 border border-slate-700/60 flex-shrink-0 flex items-center justify-center">
                <img
                  src="/images/batu-logo.png"
                  alt="جامعة برج العرب التكنولوجية"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono font-semibold">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span>بوابة مناديب السكاشن المعتمدة • الفرقة الثالثة</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-snug">
                  مواعيد فراغ السكاشن — الفرقة الثالثة
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                  الواجهة الرسمية المخصصة لمناديب سكاشن الفرقة الثالثة (شعبة سوفت وير وشعبة نيتورك) لاختيار وتوثيق فترات الفراغ المناسبة لكل سكشن بحد أقصى فترتين لكل سكشن، وتدرج تلقائياً في الجدول المعتمد.
                </p>
              </div>
            </div>

            {/* Delegate Status Badge / CTA */}
            <div className="flex flex-col sm:items-end gap-2.5">
              {delegateStudent ? (
                <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 text-right space-y-1 shadow-lg shadow-cyan-950/50">
                  <div className="flex items-center justify-end gap-1.5 text-xs text-cyan-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>تم توثيق هويتك كمندوب</span>
                  </div>
                  <div className="font-extrabold text-white text-sm">
                    {delegateStudent.fullName}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    الرقم الأكاديمي: {delegateStudent.academicNumber}
                  </div>
                  <div className="pt-1 flex items-center gap-1.5 justify-end">
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 text-[11px] font-bold border border-cyan-500/30">
                      {delegateStudent.specialization || activeSpec}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[11px] font-bold border border-purple-500/30">
                      فترات سكشنك: {mySlotsCount} / 2
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          await fetch("/api/auth/logout", { method: "POST" });
                        } catch (e) {}
                        setDelegateStudent(null);
                        setSessionUser(null);
                        setIsRegistering(true);
                        setAuthMode("LOGIN");
                      }}
                      className="px-2 py-0.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[11px] font-bold border border-red-500/30 transition"
                      title="تسجيل الخروج والتبديل لمندوب آخر"
                    >
                      خروج
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsRegistering(true);
                    setAuthMode("LOGIN");
                  }}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-cyan-600/30 transition transform hover:-translate-y-0.5 flex items-center gap-2"
                >
                  <Users className="w-4 h-4 text-white" />
                  <span>دخول / توثيق المندوب (أكاديمي + قومي)</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl border text-sm font-bold flex items-center justify-between gap-3 transition animate-in fade-in ${
              feedback.type === "success"
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-950/20"
                : "bg-red-950/40 border-red-500/40 text-red-300 shadow-lg shadow-red-950/20"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs p-1 rounded hover:bg-white/10 transition"
            >
              ✕
            </button>
          </div>
        )}

        {/* Delegate Registration Modal / Inline Box */}
        {isRegistering && !delegateStudent && (
          <div className="bg-slate-900/95 border border-cyan-500/40 rounded-3xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-cyan-400 font-extrabold text-lg">
                <Users className="w-5 h-5" />
                <span>تسجيل وتوثيق بيانات مندوب السكشن (الفرقة الثالثة)</span>
              </div>
              <button
                onClick={() => setIsRegistering(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-sm"
              >
                إغلاق ✕
              </button>
            </div>

            {regSuccessData && !isTelegramLinked ? (
              /* Telegram Linking Step */
              <div className="py-6 space-y-5 text-center max-w-lg mx-auto">
                <div className="w-16 h-16 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/40">
                  <Send className="w-8 h-8 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">الخطوة الأخيرة: ربط حساب التيليجرام</h3>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
                    مرحباً بك يا <b>{regSuccessData.student.fullName}</b>. تم حفظ بياناتك الأولية كمندوب، يرجى فتح البوت والضغط على <b>Start</b> لتأكيد هويتك واعتماد حسابك.
                  </p>
                </div>

                <div className="pt-2">
                  <a
                    href={regSuccessData.telegramDeepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm shadow-xl shadow-blue-600/30 transition flex items-center justify-center gap-2"
                  >
                    <span>فتح بوت التيليجرام والضغط على Start</span>
                    <Send className="w-4 h-4" />
                  </a>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                  <span>في انتظار تأكيد الربط من تيليجرام (يتم الكشف تلقائياً)...</span>
                </div>
              </div>
            ) : (
              /* Auth Interface: Tabbed between Login and Register */
              <div className="space-y-6 pt-4">
                {/* Tabs Switcher */}
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
                  <button
                    type="button"
                    onClick={() => setAuthMode("LOGIN")}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                      authMode === "LOGIN"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                    <span>تسجيل دخول مندوب مسجل مسبقاً (أكاديمي + قومي)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthMode("REGISTER")}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                      authMode === "REGISTER"
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>تسجيل مندوب جديد لأول مرة</span>
                  </button>
                </div>

                {/* Tab 1: Delegate Login Form */}
                {authMode === "LOGIN" ? (
                  <form onSubmit={handleDelegateLogin} className="space-y-5 max-w-xl mx-auto py-2">
                    <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-2xl p-4 text-xs text-cyan-200 leading-relaxed space-y-1">
                      <div className="font-extrabold text-cyan-100 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                        <span>تسجيل دخول سريع ومعتمد للمناديب المسجلين</span>
                      </div>
                      <p className="text-slate-300">
                        أدخل <b>رقمك الأكاديمي</b>، وتكون <b>كلمة المرور هي رقمك القومي (14 رقماً)</b> للدخول فوراً وإدارة فترات سكشنك. في حال لم تربط التيليجرام سيتم توجيهك للربط مباشرة.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Academic Number */}
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                          الرقم الأكاديمي للمندوب <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={loginAcademicNumber}
                          onChange={(e) => setLoginAcademicNumber(e.target.value)}
                          placeholder="مثال: 20230154"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs font-mono focus:ring-2 focus:ring-cyan-500 outline-none"
                          dir="ltr"
                        />
                      </div>

                      {/* National ID as Password */}
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">
                          كلمة المرور (الرقم القومي 14 رقماً) <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="password"
                          required
                          maxLength={14}
                          value={loginNationalId}
                          onChange={(e) => setLoginNationalId(e.target.value)}
                          placeholder="••••••••••••••"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs font-mono focus:ring-2 focus:ring-cyan-500 outline-none"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode("REGISTER");
                          setRegForm((prev) => ({
                            ...prev,
                            academicNumber: loginAcademicNumber,
                            nationalId: loginNationalId,
                          }));
                        }}
                        className="text-xs text-slate-400 hover:text-cyan-300 underline transition order-2 sm:order-1 text-center sm:text-right"
                      >
                        طالب مندوب جديد لم تسجل بياناتك بعد؟ اضغط هنا للتسجيل
                      </button>

                      <button
                        type="submit"
                        disabled={loginLoading}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs shadow-lg shadow-cyan-600/30 transition flex items-center justify-center gap-2 order-1 sm:order-2"
                      >
                        {loginLoading ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>جاري التحقق...</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4" />
                            <span>تسجيل الدخول واعتماد المندوب</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Tab 2: Full Registration Form */
                  <form onSubmit={handleDelegateRegisterSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Full Name */}
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          الاسم الرباعي للمندوب <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={regForm.fullName}
                          onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                          placeholder="أحمد محمد علي إبراهيم"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
                        />
                      </div>

                      {/* Academic Number */}
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          الرقم الأكاديمي <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={regForm.academicNumber}
                          onChange={(e) => setRegForm({ ...regForm, academicNumber: e.target.value })}
                          placeholder="مثال: 20230154"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs font-mono focus:ring-2 focus:ring-cyan-500 outline-none"
                          dir="ltr"
                        />
                      </div>

                      {/* National ID */}
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          الرقم القومي (14 رقماً) <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={14}
                          value={regForm.nationalId}
                          onChange={(e) => setRegForm({ ...regForm, nationalId: e.target.value })}
                          placeholder="30301010200123"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs font-mono focus:ring-2 focus:ring-cyan-500 outline-none"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Specialization */}
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          الشعبة التخصصية <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={regForm.specialization}
                          onChange={(e) =>
                            setRegForm({
                              ...regForm,
                              specialization: e.target.value as "سوفت وير" | "نيتورك",
                              groupId: "",
                              sectionId: "",
                            })
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs focus:ring-2 focus:ring-cyan-500 outline-none font-bold"
                        >
                          <option value="سوفت وير">💻 شعبة سوفت وير</option>
                          <option value="نيتورك">🌐 شعبة نيتورك</option>
                        </select>
                      </div>

                      {/* Group Selection */}
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          المجموعة <span className="text-red-400">*</span>
                        </label>
                        <select
                          required
                          value={regForm.groupId}
                          onChange={(e) => setRegForm({ ...regForm, groupId: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
                        >
                          <option value="">-- اختر المجموعة --</option>
                          {regGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Section Selection */}
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          السكشن الذي تمثله <span className="text-red-400">*</span>
                        </label>
                        <select
                          required
                          disabled={!regForm.groupId || regSections.length === 0}
                          value={regForm.sectionId}
                          onChange={(e) => setRegForm({ ...regForm, sectionId: e.target.value })}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white text-xs focus:ring-2 focus:ring-cyan-500 outline-none disabled:bg-slate-900 disabled:text-slate-500"
                        >
                          <option value="">
                            {!regForm.groupId
                              ? "-- اختر المجموعة أولاً --"
                              : regSections.length === 0
                              ? "جاري تحميل السكاشن..."
                              : "-- اختر السكشن --"}
                          </option>
                          {regSections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setAuthMode("LOGIN")}
                        className="text-xs text-slate-400 hover:text-cyan-300 underline transition order-2 sm:order-1 text-center sm:text-right"
                      >
                        مسجل مسبقاً؟ اضغط هنا للدخول بالرقم الأكاديمي والقومي
                      </button>

                      <button
                        type="submit"
                        disabled={regSubmitting}
                        className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-xs shadow-lg shadow-cyan-600/30 transition flex items-center justify-center gap-2 order-1 sm:order-2"
                      >
                        {regSubmitting ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>جاري الحفظ...</span>
                          </>
                        ) : (
                          <>
                            <span>تسجيل المندوب ومتابعة الربط</span>
                            <ChevronRight className="w-4 h-4 rotate-180" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* Division Switcher Tabs */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 w-full sm:w-auto">
            <button
              onClick={() => setActiveSpec("سوفت وير")}
              className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition flex items-center justify-center gap-2 ${
                activeSpec === "سوفت وير"
                  ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>💻 شعبة سوفت وير (Software)</span>
            </button>
            <button
              onClick={() => setActiveSpec("نيتورك")}
              className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition flex items-center justify-center gap-2 ${
                activeSpec === "نيتورك"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>🌐 شعبة نيتورك (Network)</span>
            </button>
          </div>

          {/* Quick Refresh & Legend */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span className="text-slate-300">محجوز لسكشنك</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-500/70 border border-amber-400/50" />
              <span className="text-slate-300">محجوز لسكشن آخر</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-900 border border-slate-700" />
              <span className="text-slate-300">فترة فراغ متاحة</span>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Interactive Free Slots Grid Table */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-3xl overflow-hidden backdrop-blur-xl shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right min-w-[900px]">
              {/* Table Header: Days of the week */}
              <thead>
                <tr className="bg-[#0b101d] border-b border-slate-800 text-slate-300 text-xs font-black">
                  <th className="p-4 w-40 text-center border-l border-slate-800 bg-[#070b14]">
                    الفترة / اليوم
                  </th>
                  {days.map((d) => (
                    <th
                      key={d.id}
                      className={`p-4 text-center border-l border-slate-800/80 transition ${
                        d.isOpen
                          ? "bg-slate-900/60"
                          : "bg-red-950/20 text-slate-500"
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="text-sm font-bold text-white">{d.dayName}</span>
                        {d.isOpen ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                            <Unlock className="w-2.5 h-2.5" />
                            <span>مفتوح للحجز</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-red-400 font-bold bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded-full">
                            <Lock className="w-2.5 h-2.5" />
                            <span>مغلق من الإدارة</span>
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Table Body: The 9 Periods */}
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {FREE_SLOT_PERIODS.map((period) => (
                  <tr key={period.index} className="hover:bg-slate-900/40 transition">
                    {/* Period Label Header */}
                    <td className="p-3.5 text-center border-l border-slate-800 bg-[#070b14] font-bold text-slate-300 space-y-0.5">
                      <div className="text-xs font-black text-white">{period.name}</div>
                      <div className="text-[11px] text-cyan-400 font-mono flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {period.startTime} - {period.endTime}
                        </span>
                      </div>
                    </td>

                    {/* Day Cells */}
                    {days.map((day) => {
                      const bookedSlot = slots.find(
                        (s) => s.dayName === day.dayName && s.periodIndex === period.index
                      );
                      const isMySection = bookedSlot && bookedSlot.sectionId === mySectionId;
                      const isAnotherSection = bookedSlot && !isMySection;
                      const isDayOpen = day.isOpen;
                      const isBusy = actionLoading === `${day.dayName}-${period.index}`;

                      return (
                        <td
                          key={`${day.id}-${period.index}`}
                          className={`p-2.5 border-l border-slate-800/70 align-top transition duration-200 relative ${
                            !isDayOpen && !isSuperAdmin
                              ? "bg-slate-950/60 opacity-40 cursor-not-allowed"
                              : isMySection
                              ? "bg-emerald-950/40 shadow-inner"
                              : isAnotherSection
                              ? "bg-amber-950/20"
                              : "hover:bg-cyan-950/20 cursor-pointer"
                          }`}
                          onClick={() => {
                            if (!isBusy) handleSlotClick(day.dayName, period.index);
                          }}
                        >
                          {isBusy ? (
                            <div className="h-20 flex flex-col items-center justify-center gap-1 text-cyan-400">
                              <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                              <span className="text-[10px]">جاري المعالجة...</span>
                            </div>
                          ) : !isDayOpen && !isSuperAdmin ? (
                            /* Day Closed State (مضلمة) */
                            <div className="h-20 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-600 select-none">
                              <Lock className="w-4 h-4" />
                              <span className="text-[10px] font-bold">اليوم مغلق</span>
                            </div>
                          ) : isMySection ? (
                            /* Booked by CURRENT Delegate's Section (نورت أخضر مخصص) */
                            <div className="h-full min-h-[80px] p-2.5 rounded-xl bg-gradient-to-br from-emerald-900/60 to-teal-950/60 border border-emerald-500/60 shadow-lg shadow-emerald-900/20 flex flex-col justify-between text-right space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-extrabold text-[10px] flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5 text-emerald-300" />
                                  <span>محجوز لسكشنك</span>
                                </span>
                                <span className="text-[10px] text-emerald-400 font-mono">
                                  {bookedSlot.sectionCode}
                                </span>
                              </div>

                              <div>
                                <div className="font-extrabold text-white text-xs">
                                  {bookedSlot.sectionName}
                                </div>
                                <div className="text-[10px] text-emerald-300/80">
                                  المندوب: {bookedSlot.delegateName}
                                </div>
                              </div>

                              <div className="pt-1 text-[10px] text-emerald-400 underline underline-offset-2 flex items-center gap-1">
                                <span>اضغط لإلغاء الحجز</span>
                              </div>
                            </div>
                          ) : isAnotherSection ? (
                            /* Booked by ANOTHER Section (تنور بلون ومكتوب السكشن المحجوز) */
                            <div className="h-full min-h-[80px] p-2.5 rounded-xl bg-gradient-to-br from-amber-950/40 via-purple-950/30 to-slate-900/60 border border-amber-500/40 flex flex-col justify-between text-right space-y-1 select-none">
                              <div className="flex items-center justify-between">
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px] flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>محجوز</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {bookedSlot.groupName.includes("1") ? "G1" : "G2"}
                                </span>
                              </div>

                              <div>
                                <div className="font-bold text-slate-100 text-xs">
                                  {bookedSlot.sectionName}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {bookedSlot.groupName}
                                </div>
                              </div>

                              <div className="text-[10px] text-amber-300/90 font-medium truncate" title={bookedSlot.delegateName}>
                                المندوب: {bookedSlot.delegateName}
                              </div>
                            </div>
                          ) : (
                            /* Available Free Slot */
                            <div className="h-full min-h-[80px] p-2 rounded-xl border border-dashed border-slate-800 hover:border-cyan-500/50 hover:bg-cyan-500/5 flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-cyan-300 transition text-center group">
                              <span className="text-[11px] font-bold group-hover:text-cyan-300">
                                فترة متاحة
                              </span>
                              <span className="text-[10px] text-slate-600 group-hover:text-cyan-400">
                                {mySlotsCount >= 2 && !isSuperAdmin
                                  ? "(الحد الأقصى مكتمل)"
                                  : "+ اضغط لحجز سكشنك"}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Instructions & Guidelines Box */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm">
              1
            </div>
            <h3 className="font-extrabold text-white text-sm">تسجيل بيانات المندوب والربط</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              يدخل مندوب السكشن بياناته الأكاديمية ويربط حسابه ببوت التيليجرام لاستلام التوثيق الرسمي واعتماده كمندوب للسكشن.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
              2
            </div>
            <h3 className="font-extrabold text-white text-sm">حد أقصى فترتان لكل سكشن</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              يحق لكل سكشن حجز فترتين فراغ كحد أقصى. بمجرد اختيار الفترة تنور بلون واضح ويكتب فيها السكشن والمندوب ولا يمكن للآخرين اختيارها.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
              3
            </div>
            <h3 className="font-extrabold text-white text-sm">إدراج تلقائي بالجدول المعتمد</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              يتم إدراج المواعيد تلقائياً في صفحة الجدول الخارجية والداخلية، مع إمكانية تعديلها أو تبديلها من خلال لوحة تحكم المشرف العام.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

