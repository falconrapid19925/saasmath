/**
 * POST /api/webhooks/midtrans — the payment activation boundary (plan section
 * 7). Midtrans posts HTTP notifications here; the handler only answers 2xx
 * when the notification is trusted (signature verified, order known, amount
 * matching) and applies it through applyMidtransNotification. Any HttpError
 * becomes a non-2xx JSON response so Midtrans retries unprocessed events.
 *
 * Stub mode (MIDTRANS_SERVER_KEY unset — local development without Midtrans):
 * signatures cannot verify, so the route accepts one documented dev-only
 * payload shape instead, and only that shape:
 *
 *   { "dev_simulate": true, "order_id": "<persisted order_id>",
 *     "transaction_status": "settlement" | "pending" | "expire" | ... }
 *
 * e.g. curl -X POST localhost:3000/api/webhooks/midtrans -H 'Content-Type:
 * application/json' -d '{"dev_simulate":true,"order_id":"SAASMATH-...","transaction_status":"settlement"}'
 * As soon as a server key is configured, dev_simulate is ignored and a valid
 * Midtrans signature is required — the flag can never bypass verification in
 * production.
 */

import { z } from "zod";

import { getDb } from "@/db";
import { handleRoute, parseJson } from "@/lib/server/http";
import { applyMidtransNotification } from "@/lib/server/midtrans";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notificationSchema = z.object({
  order_id: z.string().min(1),
  status_code: z.string().optional(),
  gross_amount: z.string().optional(),
  signature_key: z.string().optional(),
  transaction_status: z.string(),
  fraud_status: z.string().nullish(),
  dev_simulate: z.boolean().optional(),
});

export async function POST(req: Request) {
  return handleRoute(async () => {
    const notification = await parseJson(req, notificationSchema);
    const outcome = applyMidtransNotification(getDb(), notification);
    return Response.json({ received: true, outcome }, { status: 200 });
  });
}
