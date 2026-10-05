/**
 * Checkout pricing (plan section 7): bulanan Rp49.000; 3 bulan Rp129.000;
 * 6 bulan Rp229.000; 12 bulan Rp399.000. Pure module — no server imports —
 * so the client can display exactly the prices the server charges, while
 * src/lib/server/midtrans.ts re-exports them as the charging source of truth.
 */

export type CheckoutMonths = 1 | 3 | 6 | 12;

export type CheckoutPrice = {
  months: CheckoutMonths;
  priceIdr: number;
  /** Subscription row plan value ("bulanan" or "bundle"). */
  plan: "bulanan" | "bundle";
  labelId: string;
};

export const CHECKOUT_PRICES: Record<CheckoutMonths, CheckoutPrice> = {
  1: { months: 1, priceIdr: 49_000, plan: "bulanan", labelId: "Bulanan" },
  3: { months: 3, priceIdr: 129_000, plan: "bundle", labelId: "Paket 3 bulan" },
  6: { months: 6, priceIdr: 229_000, plan: "bundle", labelId: "Paket 6 bulan" },
  12: { months: 12, priceIdr: 399_000, plan: "bundle", labelId: "Paket 12 bulan" },
};

export function priceFor(months: number): CheckoutPrice | null {
  if (months === 1 || months === 3 || months === 6 || months === 12) {
    return CHECKOUT_PRICES[months];
  }
  return null;
}
