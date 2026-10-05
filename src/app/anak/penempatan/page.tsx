import { redirect } from "next/navigation";

import { PlacementFlow } from "@/components/PlacementFlow";
import { getSession } from "@/app/actions/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Penempatan — SaasMath" };

export default async function PlacementPage() {
  const session = await getSession();
  if (!session || session.role !== "child") redirect("/masuk");

  return (
    <main className="min-h-dvh">
      <PlacementFlow childId={session.sub} />
    </main>
  );
}
