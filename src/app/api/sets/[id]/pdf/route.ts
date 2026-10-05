/**
 * GET /api/sets/[id]/pdf — regenerate the set from its stored seed and
 * stream a printable PDF worksheet with the answer key (plan section 5:
 * Kumon-style paper practice for parents). The set regenerates through the
 * engine (determinism proof); if the family is not registered yet, the
 * stored items from the attempt are used.
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { attempts, children, skills } from "@/db/schema";
import { formatAnswer } from "@/lib/server/answers";
import { requireChildAccess } from "@/lib/server/authz";
import { generateSetItems } from "@/lib/server/engine";
import { handleRoute, HttpError } from "@/lib/server/http";
import { buildWorksheetPdf } from "@/lib/server/pdf";
import { formatDateShortId } from "@/lib/server/digest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { id } = await ctx.params;
    const db = getDb();

    const attemptRows = await db.select().from(attempts).where(eq(attempts.id, id)).limit(1);
    const attempt = attemptRows[0];
    if (!attempt) throw new HttpError(404, "Set tidak ditemukan");

    // The child themself or their parent.
    await requireChildAccess(db, attempt.childId);

    const childRows = await db
      .select({ name: children.name })
      .from(children)
      .where(eq(children.id, attempt.childId))
      .limit(1);
    const childName = childRows[0]?.name ?? "Anak";

    // Prefer regenerating from the seed (proves engine determinism); fall
    // back to the stored items when the family is not registered yet.
    let items = attempt.items;
    let title = `Latihan: ${attempt.skillId}`;
    try {
      const skillRows = await db
        .select()
        .from(skills)
        .where(eq(skills.id, attempt.skillId))
        .limit(1);
      const skill = skillRows[0];
      if (skill) {
        items = generateSetItems(skill, attempt.step, attempt.seed);
        title = `Latihan: ${skill.titleId}`;
      }
    } catch {
      items = attempt.items;
    }

    const pdf = await buildWorksheetPdf({
      title,
      metaLines: [
        `Anak: ${childName}`,
        `Keterampilan: ${attempt.skillId} • Langkah ${attempt.step}`,
        `Seed: ${attempt.seed} • ${formatDateShortId(attempt.createdAt)}`,
      ],
      items: items.map((item, i) => ({ index: i + 1, prompt: item.prompt })),
      answerKey: items.map((item, i) => ({
        index: i + 1,
        text: formatAnswer(item.answer),
      })),
      footer: "SaasMath — latihan harian",
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="saasmath-${attempt.skillId}-s${attempt.step}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
