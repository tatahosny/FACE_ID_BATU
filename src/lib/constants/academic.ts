export const ACADEMIC_YEARS = [
  "الفرقة الأولى",
  "الفرقة الثانية",
  "الفرقة الثالثة",
  "الفرقة الرابعة",
] as const;

export type AcademicYear = (typeof ACADEMIC_YEARS)[number];

export const SPECIALIZATIONS = [
  "سوفت وير",
  "نيتورك",
] as const;

export type Specialization = (typeof SPECIALIZATIONS)[number];

export const FREE_SLOT_PERIODS = [
  { index: 1, name: "الفترة الأولى", startTime: "09:00", endTime: "09:40" },
  { index: 2, name: "الفترة الثانية", startTime: "09:40", endTime: "10:20" },
  { index: 3, name: "الفترة الثالثة", startTime: "10:20", endTime: "11:00" },
  { index: 4, name: "الفترة الرابعة", startTime: "11:00", endTime: "11:40" },
  { index: 5, name: "الفترة الخامسة", startTime: "11:40", endTime: "12:20" },
  { index: 6, name: "الفترة السادسة", startTime: "12:20", endTime: "01:00" },
  { index: 7, name: "الفترة السابعة", startTime: "01:00", endTime: "01:40" },
  { index: 8, name: "الفترة الثامنة", startTime: "01:40", endTime: "02:20" },
  { index: 9, name: "الفترة التاسعة", startTime: "02:20", endTime: "03:00" },
] as const;

export const INITIAL_BATU_GROUPS = [
  { name: "المجموعة الأولى (Group 1)", code: "G1", academicYear: "الفرقة الثانية" },
  { name: "المجموعة الثانية (Group 2)", code: "G2", academicYear: "الفرقة الثانية" },
  { name: "المجموعة الثالثة (Group 3)", code: "G3", academicYear: "الفرقة الثانية" },
];

export const INITIAL_BATU_SECTIONS = [
  // Group 1
  { groupCode: "G1", name: "السكشن 1", code: "SEC-G1-1" },
  { groupCode: "G1", name: "السكشن 2", code: "SEC-G1-2" },
  { groupCode: "G1", name: "السكشن 3", code: "SEC-G1-3" },
  { groupCode: "G1", name: "السكشن 4", code: "SEC-G1-4" },
  // Group 2
  { groupCode: "G2", name: "السكشن 1", code: "SEC-G2-1" },
  { groupCode: "G2", name: "السكشن 2", code: "SEC-G2-2" },
  { groupCode: "G2", name: "السكشن 3", code: "SEC-G2-3" },
  { groupCode: "G2", name: "السكشن 4", code: "SEC-G2-4" },
  // Group 3
  { groupCode: "G3", name: "السكشن 1", code: "SEC-G3-1" },
  { groupCode: "G3", name: "السكشن 2", code: "SEC-G3-2" },
  { groupCode: "G3", name: "السكشن 3", code: "SEC-G3-3" },
  { groupCode: "G3", name: "السكشن 4", code: "SEC-G3-4" },
];

export const DEFAULT_PROXIMITY_THRESHOLDS = [10, 5, 0] as const;
