import { redirect } from "next/navigation";

export default function LegacyAdminLotteriesPage() {
  redirect("/admin/raffles");
}
