/**
 * POST /api/checkout — Midtrans checkout (plan sections 6 and 7). Each call
 * persists a pending order row (the webhook's resolution key) and, when
 * MIDTRANS_SERVER_KEY is set, calls Snap and returns the redirect URL. The
 * subscription itself is NOT touched here: activation is always the verified
 * webhook's job, so a re-checkout can never demote an active subscription.
 */

import { z } from "zod";

import { getDb } from "@/db";
import { requireOwnedChild } from "@/lib/server/authz";
import { handleRoute, parseJson } from "@/lib/server/http";
import { createMidtransCheckout, createOrder, priceFor } from "@/lib/server/midtrans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  childId: z.string().min(1),
  months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]),
});

export async function POST(req: Request) {
  return handleRoute(async () => {
    const body = await parseJson(req, bodySchema);
    const db = getDb();

    const child = await requireOwnedChild(db, body.childId);
    const price = priceFor(body.months);
    if (!price) throw new Error("unreachable: months literal-validated");

    const order = createOrder(db, { childId: child.id, price });
    const checkout = await createMidtransCheckout({ childId: child.id, price, orderId: order.orderId });

    return Response.json({ childId: child.id, ...checkout }, { status: 202 });
  });
}
