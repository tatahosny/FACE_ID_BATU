import DeskConsole from "@/components/admin/DeskConsole";

export const metadata = {
  title: "شباك T — وحدة تكنولوجيا المعلومات | BATU Face ID",
  description: "شاشة التحكم المستقلة بطابور وأدوار شباك T",
};

export default function DeskTPage() {
  return <DeskConsole desk="T" />;
}
