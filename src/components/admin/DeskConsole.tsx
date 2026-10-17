"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import {
  RefreshCw,
  Search,
  Volume2,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  Folder,
  UserCheck,
  Users,
  Monitor,
  Building2,
  Sparkles,
  ArrowRightLeft,
  VolumeX,
  PlayCircle,
  GraduationCap,
  Calendar,
  Ticket,
} from "lucide-react";

interface DeskConsoleProps {
  desk: "T" | "D";
}

export default function DeskConsole({ desk }: DeskConsoleProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [sessionUser, setSessionUser] = useState<any>(null);

  // Desks state
  const [desksData, setDesksData] = useState<any>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [assigningDesk, setAssigningDesk] = useState<boolean>(false);

  // Auto refresh & Audio chime state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("");

  const isDeskT = desk === "T";
  const themeAccent = isDeskT ? "cyan" : "purple";
  const otherDesk = isDeskT ? "D" : "T";
  const otherDeskUrl = isDeskT ? "/admin/desk-d" : "/admin/desk-t";

  // Audio chime using Web Audio API
  const playChime = () => {
    if (!audioEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // AudioContext not allowed or not supported
    }
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.data?.user) setSessionUser(j.data.user);
      })
      .catch(() => {});
  }, []);

  const isSuperAdmin = sessionUser?.role === "SUPER_ADMIN";

  const fetchDesks = async () => {
    try {
      const res = await fetch("/api/admin/desks");
      const json = await res.json();
      if (json.success && json.data) {
        setDesksData(json.data.desks);
        setStaffList(json.data.staffList || []);
      }
    } catch (err) {
      console.error("Failed to fetch desks data:", err);
    }
  };

  const fetchQueues = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("desk", desk);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/queues?${params.toString()}`);
      const json = await res.json();
      if (json.success && json.data?.items) {
        setItems(json.data.items);
        setLastRefreshedAt(
          new Date().toLocaleTimeString("ar-EG", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          })
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDesks();
    fetchQueues();
  }, [statusFilter, desk]);

  // Auto-refresh interval (every 4 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchQueues(true);
      fetchDesks();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, statusFilter, desk, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQueues();
  };

  const handleAssignStaff = async (staffId: string) => {
    try {
      setAssigningDesk(true);
      setFeedback(null);
      const res = await fetch("/api/admin/desks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desk, staffId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({
          message: json.message || `تم تعيين موظف شباك ${desk} بنجاح`,
          type: "success",
        });
        await fetchDesks();
      } else {
        setFeedback({
          message: json.error || "فشل تعيين موظف الشباك",
          type: "error",
        });
      }
    } catch (err: any) {
      setFeedback({
        message: err.message || "حدث خطأ غير متوقع أثناء التعيين",
        type: "error",
      });
    } finally {
      setAssigningDesk(false);
    }
  };

  const handleAction = async (action: string, bookingId?: string, studentId?: string) => {
    try {
      setActionLoading(`${action}_${bookingId || desk}`);
      setFeedback(null);

      const res = await fetch("/api/admin/queues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, bookingId, studentId, desk }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ message: json.error || "فشل تنفيذ الإجراء", type: "error" });
        return;
      }

      if (action === "call" || action === "call-next" || action === "repeat-alert") {
        playChime();
      }

      setFeedback({
        message:
          action === "activate"
            ? "تم تفعيل بصمة الطالب بنجاح وإرسال إشعار التيليجرام فوراً! تم إنهاء دوره وإزالته من شاشة الطابور."
            : json.message || "تم تنفيذ الإجراء بنجاح",
        type: "success",
      });
      await Promise.all([fetchQueues(), fetchDesks()]);
    } catch (err: any) {
      setFeedback({ message: err.message || "حدث خطأ غير متوقع", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Find the currently called student at this desk (if any)
  const currentlyCalledStudent = items.find((item) => item.status === "CALLED");
  // Find the next waiting student
  const nextWaitingStudent = items.find((item) => item.status === "WAITING");

  const currentDeskData = desksData?.[desk];

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Live Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/queues"
            className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>مراقبة كل الأدوار (T + D)</span>
          </Link>
          <span className="text-slate-600">/</span>
          <span
            className={`text-xs font-black px-2.5 py-0.5 rounded-lg ${
              isDeskT
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "bg-purple-500/20 text-purple-300 border border-purple-500/40"
            }`}
          >
            شاشة شباك {desk} المستقلة
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Audio Chime Toggle */}
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              audioEnabled
                ? "bg-slate-800 text-amber-400 border border-amber-500/30"
                : "bg-slate-950 text-slate-500 border border-slate-800"
            }`}
            title={audioEnabled ? "التنبيه الصوتي مفعل" : "التنبيه الصوتي معطل"}
          >
            {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{audioEnabled ? "الصوت مفعل" : "صامت"}</span>
          </button>

          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              autoRefresh
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-slate-950 text-slate-400 border border-slate-800"
            }`}
            title="تحديث تلقائي كل 4 ثوانٍ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`} />
            <span>{autoRefresh ? "مزامنة حية" : "مزامنة متوقفة"}</span>
          </button>

          {/* Switch to Other Desk */}
          <Link
            href={otherDeskUrl}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border shadow-sm ${
              isDeskT
                ? "bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/40"
                : "bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border-cyan-500/40"
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>الانتقال لشباك {otherDesk}</span>
          </Link>
        </div>
      </div>

      {/* Hero Header for this Desk */}
      <div
        className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 border shadow-2xl ${
          isDeskT
            ? "bg-gradient-to-br from-cyan-950/40 via-slate-900 to-blue-950/40 border-cyan-500/30 shadow-cyan-950/30"
            : "bg-gradient-to-br from-purple-950/40 via-slate-900 to-indigo-950/40 border-purple-500/30 shadow-purple-950/30"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-3 h-3 rounded-full animate-pulse ${
                  isDeskT ? "bg-cyan-400 shadow-md shadow-cyan-400" : "bg-purple-400 shadow-md shadow-purple-400"
                }`}
              />
              <span
                className={`text-xs font-mono font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                  isDeskT
                    ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                    : "bg-purple-500/10 text-purple-300 border-purple-500/30"
                }`}
              >
                DESK {desk} OPERATIONAL CONSOLE • طابور مستقل تماماً
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-center gap-3">
              <span>{isDeskT ? "شباك T — وحدة تكنولوجيا المعلومات" : "شباك D — وحدة شؤون الطلاب والمتابعة"}</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-300">
              تسلسل الأدوار والتذاكر يبدأ من <b className="text-amber-400 font-mono">#001</b> بشكل مستقل لهذا الشباك • مقر الشباك: الواحة — مبنى الشؤون
              {lastRefreshedAt && <span className="text-slate-400 mr-2">(آخر تحديث: {lastRefreshedAt})</span>}
            </p>
          </div>

          {/* Staff on Duty & Quick Desk Stats */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Staff Card */}
            <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 shadow-inner flex items-center gap-3 min-w-[240px]">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                  isDeskT ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" : "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                }`}
              >
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-slate-400 font-bold block">الموظف المسؤول الحالي:</span>
                {isSuperAdmin ? (
                  <select
                    disabled={assigningDesk}
                    value={currentDeskData?.staffId || ""}
                    onChange={(e) => handleAssignStaff(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 mt-0.5"
                  >
                    <option value="">-- اضغط لتعيين الموظف --</option>
                    {staffList.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.role === "SUPER_ADMIN" ? "مدير" : "موظف"})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-black text-white block mt-0.5">
                    {currentDeskData?.staffName || "غير محدد"}
                  </span>
                )}
              </div>
            </div>

            {/* Desk Counter Pills */}
            <div className="flex items-center gap-2">
              <div className="bg-slate-950/80 px-4 py-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 font-bold block">المنتظرين</span>
                <span className="text-xl font-black text-amber-400 font-mono">
                  {currentDeskData?.waiting ?? 0}
                </span>
              </div>
              <div className="bg-slate-950/80 px-4 py-3 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] text-slate-400 font-bold block">تم النداء</span>
                <span className="text-xl font-black text-blue-400 font-mono">
                  {currentDeskData?.called ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between gap-3 shadow-lg transition animate-in fade-in slide-in-from-top-2 ${
            feedback.type === "success"
              ? "bg-emerald-950/80 border border-emerald-500/40 text-emerald-200"
              : "bg-red-950/80 border border-red-500/40 text-red-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* HERO SECTION: Currently Called Student OR Next Student Call Station */}
      {currentlyCalledStudent ? (
        <div
          className={`rounded-3xl border p-6 sm:p-7 shadow-2xl transition relative overflow-hidden ${
            isDeskT
              ? "bg-gradient-to-r from-blue-950/60 via-slate-900 to-cyan-950/60 border-cyan-500/50 shadow-cyan-950/40"
              : "bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border-purple-500/50 shadow-purple-950/40"
          }`}
        >
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            {/* Student Info */}
            <div className="space-y-3 flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs font-bold text-blue-400 animate-pulse">
                <Volume2 className="w-4 h-4" />
                <span>الطالب المستدعى حالياً عند شباك {desk}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl sm:text-3xl font-black text-white">
                  {currentlyCalledStudent.studentName}
                </h2>
                {currentlyCalledStudent.hasTelegram && (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center gap-1 font-mono">
                    <Send className="w-3 h-3" />
                    <span>مرتبط بتيليجرام</span>
                  </span>
                )}
              </div>

              {/* Student Metadata Row */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300">
                  الرقم الأكاديمي: <b className="text-white font-mono">{currentlyCalledStudent.academicNumber}</b>
                </span>
                <span className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300">
                  الرقم القومي: <b className="text-white font-mono">{currentlyCalledStudent.nationalId}</b>
                </span>
                <span className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300">
                  {currentlyCalledStudent.groupName} — {currentlyCalledStudent.sectionName}
                </span>
              </div>
            </div>

            {/* Turn & Ticket Badges */}
            <div className="flex items-center gap-4 bg-slate-950/90 p-4 rounded-2xl border border-slate-800 shadow-inner">
              <div className="text-center">
                <span className="text-[10px] text-slate-400 font-bold block mb-0.5">الدور في الطابور</span>
                <div className="text-4xl sm:text-5xl font-black text-amber-400 font-mono">
                  #{currentlyCalledStudent.formattedLiveTurn || currentlyCalledStudent.formattedQueueNumber}
                </div>
              </div>
              <div className="w-[1px] h-12 bg-slate-800" />
              <div className="text-center">
                <span className="text-[10px] text-slate-400 font-bold block mb-0.5">رقم التذكرة الثابت</span>
                <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                  #{currentlyCalledStudent.formattedTicketNumber || currentlyCalledStudent.formattedQueueNumber}
                </div>
              </div>
            </div>

            {/* Quick Large Actions for the Called Student */}
            <div className="flex flex-col sm:flex-row xl:flex-col gap-2 min-w-[220px]">
              {/* Activate Fingerprint (Big Success Button) */}
              <button
                onClick={() => handleAction("activate", currentlyCalledStudent.id, currentlyCalledStudent.studentId)}
                disabled={actionLoading === `activate_${currentlyCalledStudent.id}`}
                className="px-5 py-3 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <UserCheck className="w-4 h-4" />
                <span>{actionLoading === `activate_${currentlyCalledStudent.id}` ? "جاري التفعيل..." : "✅ إتمام تسجيل البصمة"}</span>
              </button>

              <div className="flex items-center gap-2">
                {/* Repeat Alert */}
                <button
                  onClick={() => handleAction("repeat-alert", currentlyCalledStudent.id)}
                  disabled={actionLoading === `repeat-alert_${currentlyCalledStudent.id}`}
                  className="flex-1 px-3 py-2.5 rounded-xl font-bold text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  title="تكرار النداء على التيليجرام متضمناً رقم الشباك"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{actionLoading === `repeat-alert_${currentlyCalledStudent.id}` ? "..." : "تكرار النداء"}</span>
                </button>

                {/* Push Back 10 */}
                <button
                  onClick={() => handleAction("push-back", currentlyCalledStudent.id)}
                  disabled={actionLoading === `push-back_${currentlyCalledStudent.id}`}
                  className="flex-1 px-3 py-2.5 rounded-xl font-bold text-xs bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  title="تأخير الطالب 10 أدوار في هذا الشباك"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{actionLoading === `push-back_${currentlyCalledStudent.id}` ? "..." : "تأخير 10"}</span>
                </button>

                {/* Cancel */}
                <button
                  onClick={() => {
                    if (confirm(`هل أنت متأكد من إلغاء دور الطالب "${currentlyCalledStudent.studentName}" لعدم الحضور؟`)) {
                      handleAction("cancel", currentlyCalledStudent.id);
                    }
                  }}
                  disabled={actionLoading === `cancel_${currentlyCalledStudent.id}`}
                  className="px-3 py-2.5 rounded-xl font-bold text-xs bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition disabled:opacity-50 flex items-center justify-center"
                  title="إلغاء الدور نهائياً"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / Call Next Action Card */
        <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>شباك {desk} جاهز ومتاح لاستقبال طالب جديد</span>
            </span>
            <h3 className="text-xl sm:text-2xl font-black text-white">
              {nextWaitingStudent
                ? `الطالب التالي في الانتظار: ${nextWaitingStudent.studentName} (دور #${nextWaitingStudent.formattedLiveTurn || nextWaitingStudent.formattedQueueNumber})`
                : "لا يوجد طلاب في قائمة الانتظار حالياً لهذا الشباك"}
            </h3>
            <p className="text-xs text-slate-400">
              {nextWaitingStudent
                ? "اضغط الزر لاستدعاء الطالب التالي وإرسال إشعار فوري له عبر التيليجرام بالحضور للشباك."
                : "سيظهر الطلاب هنا فور حجزهم في هذا الشباك تلقائياً."}
            </p>
          </div>

          <button
            onClick={() => handleAction("call-next")}
            disabled={!nextWaitingStudent || actionLoading === `call-next_${desk}`}
            className={`px-7 py-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 transition shadow-xl ${
              nextWaitingStudent
                ? isDeskT
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black shadow-cyan-500/30 active:scale-95"
                  : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black shadow-purple-600/30 active:scale-95"
                : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
            }`}
          >
            <PlayCircle className="w-5 h-5" />
            <span>
              {actionLoading === `call-next_${desk}` ? "جاري النداء..." : `📢 نداء الطالب التالي لشباك ${desk}`}
            </span>
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-4 sm:p-5 flex flex-col gap-4 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: "ACTIVE", label: "الطابور النشط (انتظار + نداء)", icon: Clock },
              { id: "WAITING", label: "في الانتظار", icon: Clock },
              { id: "CALLED", label: "تم النداء", icon: Volume2 },
              { id: "COMPLETED", label: "تمت البصمة اليوم", icon: CheckCircle2 },
              { id: "CANCELLED", label: "أدوار ملغية", icon: XCircle },
              { id: "ALL", label: "الأرشيف بالكامل", icon: Folder },
            ].map((st) => {
              const Icon = st.icon;
              return (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    statusFilter === st.id
                      ? isDeskT
                        ? "bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/20"
                        : "bg-purple-600 text-white font-black shadow-md shadow-purple-600/20"
                      : "bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>

          <div className="text-xs text-slate-400 font-mono">
            إجمالي المعروض: <b className="text-white font-black">{items.length}</b> طالب
          </div>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`بحث سريع بالاسم أو الرقم الأكاديمي في طابور شباك ${desk}...`}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-950 text-white placeholder-slate-500"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center justify-center gap-1.5 flex-shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>بحث</span>
          </button>
        </form>
      </div>

      {/* Main Desk Table */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-sm space-y-3">
            <div
              className={`w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto ${
                isDeskT ? "border-cyan-400" : "border-purple-400"
              }`}
            />
            <p>جاري تحميل قائمة طابور شباك {desk}...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm space-y-2">
            <p className="text-base font-bold text-slate-300">لا توجد أدوار في طابور شباك {desk} تطابق الفلتر المحدد حالياً.</p>
            <p className="text-xs text-slate-500">الأدوار الجديدة التي يتم حجزها ستظهر هنا تلقائياً دون الحاجة لإعادة تحميل الصفحة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-right border-collapse min-w-[880px]">
              <thead>
                <tr className="bg-[#0b101d] border-b border-slate-800 text-slate-400 text-xs font-bold">
                  <th className="p-4">الدور في شباك {desk}</th>
                  <th className="p-4">اسم الطالب</th>
                  <th className="p-4">الرقم القومي</th>
                  <th className="p-4">الرقم الأكاديمي</th>
                  <th className="p-4">السكشن والمجموعة</th>
                  <th className="p-4">حالة البصمة</th>
                  <th className="p-4">حالة الدور</th>
                  <th className="p-4 text-center">إجراءات الشباك</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {items.map((item) => {
                  return (
                    <tr
                      key={item.id}
                      className={`transition ${
                        item.status === "CALLED"
                          ? isDeskT
                            ? "bg-cyan-950/20 hover:bg-cyan-950/30 border-l-4 border-cyan-400"
                            : "bg-purple-950/20 hover:bg-purple-950/30 border-l-4 border-purple-400"
                          : "hover:bg-slate-800/40"
                      }`}
                    >
                      {/* Dynamic Live Turn & Ticket Number */}
                      <td className="p-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className="inline-flex items-center justify-center font-mono font-black text-base px-3 py-1 rounded-xl bg-slate-950 text-amber-400 border border-amber-500/30 shadow-sm"
                            title={`الدور الفعلي في طابور شباك ${desk}`}
                          >
                            #{item.formattedLiveTurn || item.formattedQueueNumber}
                          </span>
                          <span
                            className="text-[11px] text-slate-300 font-mono font-bold bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/80"
                            title={`رقم التذكرة الثابت لشباك ${desk}`}
                          >
                            تذكرة: #{item.formattedTicketNumber || item.formattedQueueNumber}
                          </span>
                        </div>
                      </td>

                      {/* Student Name & Telegram */}
                      <td className="p-4">
                        <div className="font-extrabold text-white">{item.studentName}</div>
                        {item.hasTelegram ? (
                          <span className="text-[10px] font-semibold text-cyan-400 flex items-center gap-1 mt-0.5 font-mono">
                            <Send className="w-3 h-3" />
                            <span>مرتبط بالتيليجرام</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">غير مرتبط بتيليجرام</span>
                        )}
                      </td>

                      {/* Decrypted National ID */}
                      <td className="p-4 font-mono font-bold text-slate-200">
                        <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs tracking-wider">
                          {item.nationalId}
                        </span>
                      </td>

                      {/* Academic Number */}
                      <td className="p-4 font-mono font-bold text-slate-300">{item.academicNumber}</td>

                      {/* Section & Group */}
                      <td className="p-4">
                        <div className="font-semibold text-slate-200 text-xs">{item.sectionName}</div>
                        <div className="text-[11px] text-slate-400">{item.groupName}</div>
                      </td>

                      {/* Fingerprint Status */}
                      <td className="p-4">
                        {item.isFingerprintActivated || item.isActivated ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>مفعلة</span>
                            </span>
                            <div className="text-[10px] text-slate-400">
                              بواسطة: <b className="text-slate-300">{item.activatedByStaffName || item.activatedByName}</b>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3" />
                            <span>لم تفعل بعد</span>
                          </span>
                        )}
                      </td>

                      {/* Booking Status Badge */}
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                            item.status === "WAITING"
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                              : item.status === "CALLED"
                              ? "bg-blue-500/10 text-blue-300 border border-blue-500/30 animate-pulse"
                              : item.status === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                              : item.status === "CANCELLED"
                              ? "bg-red-500/10 text-red-300 border border-red-500/30"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {item.status === "WAITING" && "في الانتظار"}
                          {item.status === "CALLED" && (
                            <>
                              <Volume2 className="w-3 h-3" />
                              <span>تم النداء</span>
                            </>
                          )}
                          {item.status === "COMPLETED" && (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>مكتمل</span>
                            </>
                          )}
                          {item.status === "CANCELLED" && (
                            <>
                              <XCircle className="w-3 h-3" />
                              <span>ملغي</span>
                            </>
                          )}
                          {item.status === "IN_PROGRESS" && "قيد التسجيل"}
                        </span>
                      </td>

                      {/* Operational Action Buttons */}
                      <td className="p-4">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          {/* 1. Call Button (if WAITING) */}
                          {item.status === "WAITING" && (
                            <button
                              onClick={() => handleAction("call", item.id)}
                              disabled={actionLoading === `call_${item.id}`}
                              title={`نداء الطالب الآن لحضور شباك ${desk}`}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition disabled:opacity-50 flex items-center gap-1"
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>{actionLoading === `call_${item.id}` ? "..." : "نداء"}</span>
                            </button>
                          )}

                          {/* 2. Repeat Alert (if CALLED) */}
                          {item.status === "CALLED" && (
                            <button
                              onClick={() => handleAction("repeat-alert", item.id)}
                              disabled={actionLoading === `repeat-alert_${item.id}`}
                              title={`إرسال نداء مكرر للطالب على التيليجرام لشباك ${desk}`}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition disabled:opacity-50 flex items-center gap-1"
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>{actionLoading === `repeat-alert_${item.id}` ? "..." : "تكرار نداء"}</span>
                            </button>
                          )}

                          {/* 3. Push Back 10 */}
                          {(item.status === "WAITING" || item.status === "CALLED") && (
                            <button
                              onClick={() => handleAction("push-back", item.id)}
                              disabled={actionLoading === `push-back_${item.id}`}
                              title={`تأخير الطالب 10 أدوار في طابور شباك ${desk}`}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 transition disabled:opacity-50 flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>{actionLoading === `push-back_${item.id}` ? "..." : "تأخير 10"}</span>
                            </button>
                          )}

                          {/* 4. Instant Fingerprint Activation */}
                          {!item.isActivated && !item.isFingerprintActivated && item.status !== "CANCELLED" && (
                            <button
                              onClick={() => handleAction("activate", item.id, item.studentId)}
                              disabled={actionLoading === `activate_${item.id}`}
                              title="تفعيل البصمة وتوثيق الحضور واعتماد الطالب الآن"
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition disabled:opacity-50 flex items-center gap-1"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>{actionLoading === `activate_${item.id}` ? "..." : "تفعيل"}</span>
                            </button>
                          )}

                          {/* 5. Cancel */}
                          {item.status !== "CANCELLED" && item.status !== "COMPLETED" && (
                            <button
                              onClick={() => {
                                if (confirm(`هل أنت متأكد من إلغاء دور الطالب "${item.studentName}" لعدم الحضور؟`)) {
                                  handleAction("cancel", item.id);
                                }
                              }}
                              disabled={actionLoading === `cancel_${item.id}`}
                              title="إلغاء الدور"
                              className="px-2 py-1 rounded-lg text-xs font-bold bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition disabled:opacity-50 flex items-center"
                            >
                              <XCircle className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
