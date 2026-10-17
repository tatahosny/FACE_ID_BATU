import DeskConsole from "@/components/admin/DeskConsole";

export const metadata = {
  title: "شباك D — وحدة شؤون الطلاب والمتابعة | BATU Face ID",
  description: "شاشة التحكم المستقلة بطابور وأدوار شباك D",
};

export default function DeskDPage() {
  return <DeskConsole desk="D" />;
}
