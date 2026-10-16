"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Lock,
  Smartphone,
  Send,
  AlertTriangle,
  Ticket,
  Volume2,
  Zap,
  ShieldCheck,
  Building,
  GraduationCap,
  Sparkles,
} from "lucide-react";

interface Group {
  id: string;
  name: string;
  code: string;
}

interface Section {
  id: string;
  groupId: string;
  name: string;
  code: string;
}

export default function RegisterPage() {
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingAcademic, setLoadingAcademic] = useState(true);

  // Form State
  const [formData, setFormData] = useState({
    fullName: "",
    academicNumber: "",
    nationalId: "",
    groupId: "",
    sectionId: "",
    subSection: "A",
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    student: any;
    telegramDeepLink: string;
  } | null>(null);

  const [isLinked, setIsLinked] = useState(false);
  const [linkedData, setLinkedData] = useState<{ telegramUsername?: string | null } | null>(null);

  // Poll for linking status and prevent navigating away if not linked
  useEffect(() => {
    if (!successResult?.student?.id || isLinked) return;

    // Prevent closing or refreshing the tab before linking
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "تنبيه: يجب إتمام ربط حسابك في تيليجرام لتفعيل الحساب ومتابعة الحجز.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Poll every 2.5 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/students/link-status?studentId=${successResult.student.id}`);
        const json = await res.json();
        if (json.success && json.data?.isLinked) {
          setIsLinked(true);
          setLinkedData({ telegramUsername: json.data.telegramUsername });
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Link check failed:", err);
      }
    }, 2500);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearInterval(interval);
    };
  }, [successResult?.student?.id, isLinked]);

  // Fetch Groups on mount
  useEffect(() => {
    async function loadGroups() {
      try {
        setLoadingAcademic(true);
        const res = await fetch("/api/groups");
        const json = await res.json();
        if (json.success && json.data.groups) {
          setGroups(json.data.groups);
        }
      } catch (err) {
        console.error("Failed to load groups:", err);
      } finally {
        setLoadingAcademic(false);
      }
    }
    loadGroups();
  }, []);

  // Fetch Sections dynamically when Group changes
  useEffect(() => {
    if (!formData.groupId) {
      setSections([]);
      setFormData((prev) => ({ ...prev, sectionId: "" }));
      return;
    }

    async function loadSections(groupId: string) {
      try {
        const res = await fetch(`/api/sections?groupId=${groupId}`);
        const json = await res.json();
        if (json.success && json.data.sections) {
          setSections(json.data.sections);
        }
      } catch (err) {
        console.error("Failed to load sections:", err);
      }
    }

    loadSections(formData.groupId);
  }, [formData.groupId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client-side quick checks
    if (!formData.fullName.trim() || !formData.academicNumber.trim() || !formData.nationalId.trim()) {
      setErrorMessage("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    if (formData.nationalId.trim().length !== 14 || !/^\d{14}$/.test(formData.nationalId.trim())) {
      setErrorMessage("الرقم القومي يجب أن يتكون من 14 رقماً بالضبط");
      return;
    }

    if (!formData.groupId || !formData.sectionId) {
      setErrorMessage("يرجى اختيار المجموعة والسكشن الأكاديمي");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/students/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setErrorMessage(json.error || "فشل تسجيل البيانات، يرجى المحاولة مرة أخرى");
        return;
      }

      setSuccessResult({
        student: json.data.student,
        telegramDeepLink: json.data.telegramDeepLink,
      });
    } catch (err: any) {
      setErrorMessage(err.message || "حدث خطأ غير متوقع في الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 py-12 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto w-full">
      {/* Page Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-2xl bg-white p-2 mb-3 shadow-xl shadow-blue-500/20 border border-slate-700 flex items-center justify-center">
          <img
            src="/images/batu-logo.png"
            alt="جامعة برج العرب التكنولوجية"
            className="w-full h-full object-contain"
          />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
          تسجيل بيانات الطالب الأكاديمية
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          جامعة برج العرب التكنولوجية • قسم تكنولوجيا المعلومات (الفرقة الثانية)
        </p>
      </div>

      {/* Success / Mandatory Linking State Screen */}
      {successResult ? (
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-10 space-y-6 text-center animate-fade-in relative overflow-hidden backdrop-blur-xl">
          {isLinked ? (
            /* State 2: Linking Completed Successfully */
            <div className="space-y-6 animate-scale-up">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner border-2 border-emerald-500/40">
                <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              </div>

              <div>
                <span className="inline-block py-1 px-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold mb-2">
                  تم التوثيق والربط الأكاديمي بنجاح
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center justify-center gap-2">
                  <span>تم الربط بنجاح</span>
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                </h2>
                <p className="text-sm text-slate-300 mt-2">
                  مرحباً بك يا <b>{successResult.student.fullName}</b>
                  {linkedData?.telegramUsername && (
                    <span className="text-cyan-400 font-semibold mx-1">
                      (@{linkedData.telegramUsername})
                    </span>
                  )}
                  ، تم ربط حسابك في بوت الجامعة بنجاح تام.
                </p>
              </div>

              {/* Crucial Notice */}
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-5 text-right space-y-2 shadow-sm text-amber-200">
                <div className="flex items-center gap-2 text-amber-400 font-extrabold text-base">
                  <Volume2 className="w-5 h-5 text-amber-400" />
                  <span>تنبيه هام وموعد الحجز:</span>
                </div>
                <p className="text-sm sm:text-base font-bold text-slate-100 leading-relaxed">
                  يرجى التوجه لصفحة الحجز عند فتح الحجز للسكشن الخاص بك (
                  <span className="underline decoration-amber-500 underline-offset-4 text-amber-300">
                    {sections.find((s) => s.id === successResult.student.sectionId)?.name || "سكشنك الأكاديمي"}
                  </span>
                  ).
                </p>
                <p className="text-xs text-amber-300/80 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>ستصلك رسالة إشعار فورية على تطبيق التيليجرام فور بدء فترة الحجز الرسمية لسكشنك مباشرة.</span>
                </p>
              </div>

              {/* Student Summary Card */}
              <div className="bg-slate-950/70 rounded-2xl p-4 border border-slate-800 text-xs sm:text-sm space-y-2 text-right">
                <div className="flex justify-between items-center py-1 border-b border-slate-800">
                  <span className="text-slate-400">الرقم الأكاديمي:</span>
                  <span className="font-bold text-white font-mono">{successResult.student.academicNumber}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800">
                  <span className="text-slate-400">المجموعة:</span>
                  <span className="font-semibold text-slate-200">
                    {groups.find((g) => g.id === successResult.student.groupId)?.name || "محددة"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-800">
                  <span className="text-slate-400">السكشن:</span>
                  <span className="font-semibold text-slate-200">
                    {sections.find((s) => s.id === successResult.student.sectionId)?.name || "محدد"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">القسم الفرعي:</span>
                  <span className="font-bold text-amber-400 font-mono">
                    قسم {successResult.student.subSection || formData.subSection}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <Link
                  href="/booking"
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-extrabold text-base shadow-lg shadow-emerald-600/30 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  <span>الانتقال لصفحة الحجز الآن</span>
                  <Ticket className="w-5 h-5 text-white" />
                </Link>
              </div>
            </div>
          ) : (
            /* State 1: Mandatory Linking In Progress (Blocked from proceeding) */
            <div className="space-y-6">
              <div className="w-20 h-20 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto shadow-inner border-2 border-blue-500/40">
                <Lock className="w-10 h-10 text-blue-400" />
              </div>

              <div>
                <span className="inline-block py-1 px-3 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold mb-2">
                  خطوة إلزامية لإتمام التسجيل
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                  يجب ربط حساب التيليجرام أولاً
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                  مرحباً بك يا <b>{successResult.student.fullName}</b>. تم حفظ بياناتك الأولية بنجاح، ولكن <b>لا يمكنك الخروج من هذه الصفحة أو متابعة الحجز</b> إلا بعد إتمام ربط حسابك عبر تيليجرام.
                </p>
              </div>

              {/* Linking Instruction Box */}
              <div className="bg-blue-950/40 border border-blue-500/30 rounded-2xl p-5 text-right space-y-3">
                <h3 className="font-extrabold text-blue-300 text-sm sm:text-base flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-blue-400" />
                  <span>خطوات الربط المطلوبة الآن:</span>
                </h3>
                <ol className="text-xs sm:text-sm text-slate-300 space-y-2 list-decimal list-inside pr-1 leading-relaxed">
                  <li>اضغط على الزر الأزرق الكبير بالأسفل لفتح تطبيق تيليجرام.</li>
                  <li>اضغط على زر <b>Start (بدء)</b> داخل المحادثة مع البوت.</li>
                  <li>ستقوم هذه الصفحة بالتحقق والتحديث <b>تلقائياً وفورياً دون الحاجة لإعادة تحميل الصفحة</b>.</li>
                </ol>

                <div className="pt-2">
                  <a
                    href={successResult.telegramDeepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-extrabold text-base text-center shadow-lg shadow-blue-600/30 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    <span>فتح بوت التيليجرام والضغط على Start</span>
                    <Send className="w-5 h-5" />
                  </a>
                </div>
              </div>

              {/* Real-time Polling Status Radar */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex items-center justify-center gap-3 text-slate-400 text-xs sm:text-sm font-medium">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500"></span>
                </span>
                <span>في انتظار الضغط على Start في تيليجرام (يتم الكشف تلقائياً)...</span>
              </div>

              <div className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>تم قفل هذه الصفحة حتى يتم التحقق من الربط لمنع فقدان إشعارات الطابور.</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Registration Form */
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-10 backdrop-blur-xl">
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-bold text-slate-200 mb-1">
                الاسم الرباعي كما هو بالبطاقة الرسمية <span className="text-red-400">*</span>
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={formData.fullName}
                onChange={handleChange}
                placeholder="أحمد محمد علي إبراهيم"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* Academic Number */}
            <div>
              <label htmlFor="academicNumber" className="block text-sm font-bold text-slate-200 mb-1">
                الرقم الأكاديمي / رقم القيد بالكلية <span className="text-red-400">*</span>
              </label>
              <input
                id="academicNumber"
                name="academicNumber"
                type="text"
                required
                value={formData.academicNumber}
                onChange={handleChange}
                placeholder="مثال: 20230154"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono text-left"
                dir="ltr"
              />
            </div>

            {/* Egyptian National ID */}
            <div>
              <label htmlFor="nationalId" className="block text-sm font-bold text-slate-200 mb-1">
                الرقم القومي (14 رقماً) <span className="text-red-400">*</span>
              </label>
              <input
                id="nationalId"
                name="nationalId"
                type="text"
                maxLength={14}
                required
                value={formData.nationalId}
                onChange={handleChange}
                placeholder="30301010200123"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono text-left"
                dir="ltr"
              />
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>يتم تشفير الرقم القومي بتقنية التشفير المتقدم (AES-256) ولا يتم عرضه لأي طرف.</span>
              </p>
            </div>

            {/* Group Selection */}
            <div>
              <label htmlFor="groupId" className="block text-sm font-bold text-slate-200 mb-1">
                المجموعة الأكاديمية <span className="text-red-400">*</span>
              </label>
              <select
                id="groupId"
                name="groupId"
                required
                value={formData.groupId}
                onChange={handleChange}
                disabled={loadingAcademic}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">-- اختر المجموعة الأكاديمية --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Selection (Dynamic) */}
            <div>
              <label htmlFor="sectionId" className="block text-sm font-bold text-slate-200 mb-1">
                السكشن الأكاديمي <span className="text-red-400">*</span>
              </label>
              <select
                id="sectionId"
                name="sectionId"
                required
                value={formData.sectionId}
                onChange={handleChange}
                disabled={!formData.groupId || sections.length === 0}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-slate-900 disabled:text-slate-500 disabled:border-slate-800"
              >
                <option value="" className="bg-slate-900 text-slate-400">
                  {!formData.groupId
                    ? "-- يرجى اختيار المجموعة أولاً --"
                    : sections.length === 0
                    ? "جاري تحميل السكاشن..."
                    : "-- اختر السكشن --"}
                </option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Sub-Section (Division A or B) */}
            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                القسم الفرعي داخل السكشن <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, subSection: "A" }))}
                  className={`py-3 px-4 rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2 ${
                    formData.subSection === "A"
                      ? "bg-blue-600/30 border-blue-500 text-blue-300 ring-2 ring-blue-500/40"
                      : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                  }`}
                >
                  <span>قسم A</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, subSection: "B" }))}
                  className={`py-3 px-4 rounded-xl border text-sm font-bold transition flex items-center justify-center gap-2 ${
                    formData.subSection === "B"
                      ? "bg-blue-600/30 border-blue-500 text-blue-300 ring-2 ring-blue-500/40"
                      : "bg-slate-950 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                  }`}
                >
                  <span>قسم B</span>
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                اختر ما إذا كنت مسجلاً في قسم A أو قسم B داخل سكشنك لتحديد موعد فترتك بدقة.
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 disabled:bg-blue-900 text-white font-extrabold text-sm shadow-xl shadow-blue-600/30 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>جاري حفظ البيانات وتأمين القيد...</span>
                  </>
                ) : (
                  <span>تأكيد التسجيل والمتابعة</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
