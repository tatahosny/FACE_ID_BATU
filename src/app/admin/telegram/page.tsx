"use client";

import { useState, useEffect } from "react";
import { formatCairoDateTime } from "@/lib/utils/datetime";

export default function AdminTelegramBroadcastPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState<"ALL" | "GROUP" | "SECTION">("ALL");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");

  // Audience Preview State
  const [previewData, setPreviewData] = useState<{
    totalStudents: number;
    eligibleTelegramRecipients: number;
    unlinkedStudents: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Submission / Action State
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/telegram/campaigns");
      const json = await res.json();
      if (json.success && json.data.campaigns) {
        setCampaigns(json.data.campaigns);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        await fetchCampaigns();

        const [grpRes, tplRes] = await Promise.all([
          fetch("/api/groups"),
          fetch("/api/telegram/templates"),
        ]);
        const grpJson = await grpRes.json();
        const tplJson = await tplRes.json();

        if (grpJson.success) setGroups(grpJson.data.groups);
        if (tplJson.success) setTemplates(tplJson.data.templates);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Update sections when group changes
  useEffect(() => {
    if (!selectedGroupId) {
      setSections([]);
      setSelectedSectionId("");
      return;
    }
    fetch(`/api/sections?groupId=${selectedGroupId}`)
      .then((r) => r.json())
      .then((j) => j.success && setSections(j.data.sections));
  }, [selectedGroupId]);

  // Fetch Audience Preview when filters change
  useEffect(() => {
    async function loadPreview() {
      try {
        setPreviewLoading(true);
        let url = `/api/telegram/campaigns?preview=true&targetType=${targetType}`;
        if (targetType === "GROUP" && selectedGroupId) url += `&groupId=${selectedGroupId}`;
        if (targetType === "SECTION" && selectedSectionId) url += `&sectionId=${selectedSectionId}`;

        const res = await fetch(url);
        const json = await res.json();
        if (json.success && json.data.preview) {
          setPreviewData(json.data.preview);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setPreviewLoading(false);
      }
    }
    loadPreview();
  }, [targetType, selectedGroupId, selectedSectionId]);

  const handleApplyTemplate = (templateContent: string) => {
    setMessage(templateContent);
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setStatusMsg({ text: "يرجى كتابة عنوان ورسالة الحملة", type: "error" });
      return;
    }

    try {
      setSubmitting(true);
      setStatusMsg(null);

      const res = await fetch("/api/telegram/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          message,
          targetType,
          targetFilters: {
            groupId: selectedGroupId || undefined,
            sectionId: selectedSectionId || undefined,
          },
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setStatusMsg({ text: json.error || "فشل إنشاء الحملة", type: "error" });
        return;
      }

      setStatusMsg({
        text: `✅ تم إنشاء حملة الرسائل بنجاح وجدولة ${json.data.campaign.totalRecipients} مستلم!`,
        type: "success",
      });

      setTitle("");
      setMessage("");
      await fetchCampaigns();
    } catch (err: any) {
      setStatusMsg({ text: err.message, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTriggerSend = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/telegram/campaigns/${campaignId}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({
          text: json.data.completed
            ? "اكتمل إرسال جميع رسائل الحملة بنجاح!"
            : `تم إرسال دفعة (${json.data.sentInBatch} رسالة) بنجاح.`,
          type: "success",
        });
        await fetchCampaigns();
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message, type: "error" });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          إدارة حملات التيليجرام الجماعية (Telegram Broadcast Management)
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          إرسال إعلانات وتنبيهات رسمية موجهة لكافة الطلاب أو لمجموعة وسكشن محدد
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-sm font-medium ${
            statusMsg.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Campaign Composer Form & Audience Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composer Form (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-5 backdrop-blur-xl text-white">
          <h2 className="text-base font-bold text-white pb-2 border-b border-slate-800">
            إنشاء رسالة جماعية جديدة
          </h2>

          <form onSubmit={handleCreateCampaign} className="space-y-4 text-right">
            {/* Target Audience Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                تحديد الجمهور المستهدف
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTargetType("ALL")}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    targetType === "ALL"
                      ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                      : "bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  جميع طلاب الكلية
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType("GROUP")}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    targetType === "GROUP"
                      ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                      : "bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  مجموعة محددة
                </button>
                <button
                  type="button"
                  onClick={() => setTargetType("SECTION")}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition ${
                    targetType === "SECTION"
                      ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                      : "bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  سكشن محدد
                </button>
              </div>
            </div>

            {/* Group & Section Dropdowns */}
            {targetType !== "ALL" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">المجموعة</label>
                  <select
                    required
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="" className="bg-slate-900 text-slate-400">-- اختر المجموعة --</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                {targetType === "SECTION" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">السكشن</label>
                    <select
                      required
                      value={selectedSectionId}
                      onChange={(e) => setSelectedSectionId(e.target.value)}
                      disabled={!selectedGroupId}
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 text-xs bg-slate-950 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-900 disabled:text-slate-500 disabled:border-slate-800"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">-- اختر السكشن --</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Predefined Templates Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                استخدام قالب جاهز (اختياري)
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl.content)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 text-[11px] font-semibold text-slate-300 bg-slate-950 hover:bg-slate-800 whitespace-nowrap transition"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign Title */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">عنوان الإعلان</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: تنبيه هام بشأن فتح حجز بصمة الوجه للسكشن 3"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Campaign Message Body */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">نص الرسالة</label>
              <textarea
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="اكتب تفاصيل الرسالة هنا..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-950 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:bg-blue-900 text-white font-bold text-sm shadow-md shadow-blue-600/30 transition"
            >
              {submitting ? "جاري إنشاء الحملة وتجهيز المستلمين..." : "جدولة وإرسال الحملة"}
            </button>
          </form>
        </div>

        {/* Audience Preview Card (1 col) */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl p-6 space-y-4 self-start backdrop-blur-xl text-white">
          <h2 className="text-base font-bold text-white pb-2 border-b border-slate-800">
            معاينة أعداد الجمهور المستهدف
          </h2>

          {previewLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">جاري احتساب أعداد الطلاب...</div>
          ) : previewData ? (
            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">إجمالي طلاب الشريحة:</span>
                <span className="font-bold text-white font-mono text-sm">
                  {previewData.totalStudents}
                </span>
              </div>

              <div className="bg-emerald-950/40 rounded-xl p-3 border border-emerald-500/30 flex justify-between items-center">
                <span className="text-emerald-300 font-semibold">المؤهلين للاستلام (مربوط تيليجرام):</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">
                  {previewData.eligibleTelegramRecipients}
                </span>
              </div>

              <div className="bg-amber-950/40 rounded-xl p-3 border border-amber-500/30 flex justify-between items-center">
                <span className="text-amber-300">طلاب بدون حساب تيليجرام:</span>
                <span className="font-bold text-amber-400 font-mono text-sm">
                  {previewData.unlinkedStudents}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-800">
                تُرسل الرسائل فقط للطلاب الذين قاموا بربط حساباتهم ببوت التيليجرام الرسمي بمعدل زمني آمن يتوافق مع سياسات تيليجرام لمنع الحظر.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Campaigns History */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-xl">
        <div className="p-4 bg-[#0b101d] border-b border-slate-800">
          <h3 className="font-bold text-sm text-white">سجل الحملات والإعلانات السابقة</h3>
        </div>

        {campaigns.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">لا توجد حملات مرسلة مسبقاً.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-bold">العنوان</th>
                  <th className="py-3 px-4 font-bold">الجمهور المستهدف</th>
                  <th className="py-3 px-4 font-bold">المستلمين</th>
                  <th className="py-3 px-4 font-bold">المرسل / الفاشل</th>
                  <th className="py-3 px-4 font-bold">الحالة</th>
                  <th className="py-3 px-4 font-bold">تاريخ الإنشاء</th>
                  <th className="py-3 px-4 font-bold text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-bold text-white max-w-[200px] truncate">
                      {c.title}
                    </td>
                    <td className="py-3 px-4 text-cyan-400 font-mono">{c.targetType}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-200">{c.totalRecipients}</td>
                    <td className="py-3 px-4 font-mono">
                      <span className="text-emerald-400 font-bold">{c.sentCount}</span> /{" "}
                      <span className="text-red-400">{c.failedCount}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{formatCairoDateTime(c.createdAt)}</td>
                    <td className="py-3 px-4 text-center">
                      {c.status !== "COMPLETED" && (
                        <button
                          onClick={() => handleTriggerSend(c.id)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] shadow transition"
                        >
                          إرسال دفعة
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
