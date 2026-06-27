import type { Metadata } from "next";
import { UserRouletteDraw } from "@/components/user-roulette-draw";
import { requireApprovedUser } from "@/lib/auth";
import { getUserDrawTickets } from "@/lib/data";

export const metadata: Metadata = { title: "직접 뽑기" };
export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const profile = await requireApprovedUser();
  const tickets = await getUserDrawTickets(profile.id);
  return <main className="page"><div className="container"><UserRouletteDraw tickets={tickets} /></div></main>;
}
