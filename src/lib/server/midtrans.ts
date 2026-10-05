/**
 * Midtrans checkout — plan sections 6 and 7 (QRIS, virtual accounts,
 * e-wallets via Snap). Pricing lives in src/lib/checkout-prices.ts (shared
 * with the client display). Env-gated: without MIDTRANS_SERVER_KEY the
 * module returns a placeholder payload that documents exactly where the real
 * Snap call goes. With a server key set, it performs the documented Snap API
 * call; activation happens only through the verified webhook below.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { SaasMathDb } from "@/db";
import { orders, subscriptions, type Order } from "@/db/schema";
// Pricing is shared with the client display (src/components/parent/ParentWidgets.tsx);
// re-exported here so server callers keep one charging source of truth.
import { CHECKOUT_PRICES, priceFor, type CheckoutMonths, type CheckoutPrice } from "../checkout-prices";
import { trialEndsFrom } from "./island";
import { HttpError } from "./http";

export { CHECKOUT_PRICES, priceFor };
export type { CheckoutMonths, CheckoutPrice };

export type CheckoutResult = {
  mode: "stub" | "snap";
  orderId: string;
  /** Snap redirect/token URL; null in stub mode. */
  snapUrl: string | null;
  amountIdr: number;
  months: CheckoutMonths;
  plan: "bulanan" | "bundle";
  /** Bahasa, client-displayable status. */
  statusId: string;
  /** Where Snap goes when the server key is configured (documented stub). */
  snapEndpoint: string;
  notes: string[];
};

function midtransApiBase(): string {
  const explicit = process.env.MIDTRANS_API_BASE;
  if (explicit) return explicit.replace(/\/$/, "");
  return process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

/**
 * Persist one checkout attempt as a pending order row. The Midtrans webhook
 * resolves the payment through this row (child, plan, amount), so checkout
 * never mutates a paid subscription — activation is the webhook's job, and a
 * re-checkout must not demote an already-active subscription.
 *
 * Checkout initiation also starts the 7-day free trial (plan section 5), but
 * exactly once: only a subscription row that is still plan 'free' with no
 * trial end picks one up, and both writes commit in one transaction. An
 * expired or running trial, or a paid plan, is left untouched.
 */
export function createOrder(
  db: SaasMathDb,
  input: { childId: string; price: CheckoutPrice },
): Order {
  const now = new Date();
  const trialEndsAt = trialEndsFrom(now);
  return db.transaction((tx) => {
    const orderId = `SAASMATH-${input.childId.slice(0, 8)}-${now.getTime()}-${crypto.randomUUID().slice(0, 8)}`;
    const inserted = tx
      .insert(orders)
      .values({
        orderId,
        childId: input.childId,
        plan: input.price.plan,
        months: input.price.months,
        amountIdr: input.price.priceIdr,
        status: "pending",
      })
      .returning()
      .all();
    tx.insert(subscriptions)
      .values({ childId: input.childId, plan: "trial", trialEndsAt, status: "active" })
      .onConflictDoUpdate({
        target: subscriptions.childId,
        set: { plan: "trial", trialEndsAt },
        // Exactly-once: never refresh a running/expired trial, never touch paid plans.
        setWhere: and(eq(subscriptions.plan, "free"), isNull(subscriptions.trialEndsAt)),
      })
      .run();
    return inserted[0]!;
  });
}

/** Look an order up by its Midtrans order_id (the webhook's resolution key). */
export function getOrderByOrderId(db: SaasMathDb, orderId: string): Order | null {
  const rows = db.select().from(orders).where(eq(orders.orderId, orderId)).limit(1).all();
  return rows[0] ?? null;
}

export async function createMidtransCheckout(input: {
  childId: string;
  price: CheckoutPrice;
  /** The persisted order's order_id — Snap must charge the same id the webhook resolves. */
  orderId: string;
}): Promise<CheckoutResult> {
  const { price, orderId } = input;
  const snapEndpoint = `${midtransApiBase()}/snap/v1/transactions`;
  const serverKey = process.env.MIDTRANS_SERVER_KEY;

  const notes: string[] = [];

  if (!serverKey) {
    // Stub mode: pending order + placeholder payload; no external call.
    notes.push(
      "STUB: MIDTRANS_SERVER_KEY tidak ada — order dicatat dengan status 'pending'; subscription baru aktif setelah webhook terverifikasi.",
    );
    notes.push(
      "Produksi: POST ke snapEndpoint dengan Basic-auth username=<SERVER_KEY> dan payload transaction_details (order_id, gross_amount); redirect orang tua ke response.redirect_url (Snap), lalu aktifkan subscription dari webhook notifikasi (verify signature_key).",
    );
    return {
      mode: "stub",
      orderId,
      snapUrl: null,
      amountIdr: price.priceIdr,
      months: price.months,
      plan: price.plan,
      statusId: "Menunggu pembayaran (mode stub)",
      snapEndpoint,
      notes,
    };
  }

  // Documented Snap call (stub-quality Phase 2 wiring).
  const response = await fetch(snapEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: orderId,
        gross_amount: price.priceIdr,
      },
      item_details: [
        {
          id: `saasmath-${price.months}m`,
          price: price.priceIdr,
          quantity: 1,
          name: `SaasMath ${price.labelId}`,
        },
      ],
      credit_card: { secure: true },
    }),
  });

  if (!response.ok) {
    throw new HttpError(502, `Midtrans Snap API error: ${await response.text()}`);
  }

  const snap = (await response.json()) as { redirect_url?: string; token?: string };
  notes.push("Langsung ke Snap; aktivasi lewat webhook notifikasi.");
  return {
    mode: "snap",
    orderId,
    snapUrl: snap.redirect_url ?? null,
    amountIdr: price.priceIdr,
    months: price.months,
    plan: price.plan,
    statusId: "Menunggu pembayaran",
    snapEndpoint,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Webhook: verified Midtrans HTTP notifications (the activation boundary)
// ---------------------------------------------------------------------------

/** The subset of Midtrans' HTTP notification body this flow acts on. */
export type MidtransNotification = {
  order_id: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status: string;
  fraud_status?: string | null;
  /** Dev-only simulation flag — honored ONLY while MIDTRANS_SERVER_KEY is unset. */
  dev_simulate?: boolean;
};

export type WebhookOutcome = "activated" | "pending" | "failed";

/**
 * sha512(order_id + status_code + gross_amount + server_key) — Midtrans' own
 * verification formula. Without a configured server key nothing cryptographic
 * can verify, so the only accepted shape is the documented dev_simulate
 * payload (see src/app/api/webhooks/midtrans/route.ts); with a key set, the
 * flag is ignored and the real signature is required.
 */
export function verifyNotificationSignature(notification: MidtransNotification): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return notification.dev_simulate === true;
  }
  const expected = createHash("sha512")
    .update(
      `${notification.order_id}${notification.status_code ?? ""}${notification.gross_amount ?? ""}${serverKey}`,
    )
    .digest("hex");
  const provided = notification.signature_key ?? "";
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function activateOrder(db: SaasMathDb, order: Order): void {
  db.update(orders)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(orders.id, order.id))
    .run();
  // Upsert keeps replays idempotent and preserves "one subscription per child".
  db.insert(subscriptions)
    .values({ childId: order.childId, plan: order.plan, trialEndsAt: null, status: "active" })
    .onConflictDoUpdate({
      target: subscriptions.childId,
      set: { plan: order.plan, trialEndsAt: null, status: "active" },
    })
    .run();
}

function failOrder(db: SaasMathDb, order: Order): void {
  db.update(orders).set({ status: "failed" }).where(eq(orders.id, order.id)).run();
}

/**
 * Apply one verified notification to the order book and the subscription.
 * Throws HttpError(403/404/400) on untrusted or unresolvable notifications —
 * the non-2xx answer makes Midtrans retry, while a 2xx acknowledges for good.
 * Only a settlement/capture with fraud_status accept (or absent) activates;
 * failures and expiry mark the order failed and never touch the subscription
 * (an active plan from an earlier payment must survive a failed re-order).
 */
export function applyMidtransNotification(
  db: SaasMathDb,
  notification: MidtransNotification,
): WebhookOutcome {
  if (!verifyNotificationSignature(notification)) {
    throw new HttpError(403, "Invalid Midtrans notification signature");
  }
  const order = getOrderByOrderId(db, notification.order_id);
  if (!order) throw new HttpError(404, "Unknown Midtrans order_id");
  if (
    notification.gross_amount !== undefined &&
    Number(notification.gross_amount) !== order.amountIdr
  ) {
    throw new HttpError(400, "Notification gross_amount disagrees with the order");
  }

  if (notification.transaction_status === "settlement" || notification.transaction_status === "capture") {
    const fraud = notification.fraud_status;
    if (fraud === "deny") {
      failOrder(db, order);
      return "failed";
    }
    if (fraud && fraud !== "accept") return "pending"; // e.g. card challenge
    activateOrder(db, order);
    return "activated";
  }

  if (["deny", "cancel", "expire", "failure"].includes(notification.transaction_status)) {
    failOrder(db, order);
    return "failed";
  }

  return "pending";
}
