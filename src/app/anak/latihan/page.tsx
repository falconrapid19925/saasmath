import { redirect } from "next/navigation";

import { DrillPlayer } from "@/components/drill/DrillPlayer";
import { getChildName, isPlacementDone } from "@/app/actions/drill";
import { getSession } from "@/app/actions/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Latihan hari ini — SaasMath" };

export default async function DrillPage() {
  const session = await getSession();
  if (!session || session.role !== "child") redirect("/masuk");

  // Quick guard only — the task itself loads client-side via
  // POST /api/session/next so the player and the API share one decision path.
  const [placed, name] = await Promise.all([isPlacementDone(), getChildName()]);
  if (!placed) redirect("/anak/penempatan");

  return (
    <main className="min-h-dvh bg-slate-50">
      <DrillPlayer childName={name ?? "Anak"} />
    </main>
  );
}
