/**
 * Seam test for the parent dashboard checkout panel: what a parent sees on
 * /orangtua. Rendered statically (no DOM in the vitest environment); the four
 * prices are the plan-section-7 literals — Bulanan Rp49.000, 3 bulan
 * Rp129.000, 6 bulan Rp229.000, 12 bulan Rp399.000 — asserted as literals,
 * not recomputed from CHECKOUT_PRICES.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CheckoutPanel } from "./ParentWidgets";

function render(plan: string, status: string): string {
  return renderToStaticMarkup(
    createElement(CheckoutPanel, { childId: "child-ui-1", plan, status }),
  );
}

describe("CheckoutPanel", () => {
  it("offers all four plans at the section-7 prices", () => {
    const markup = render("free", "active");
    for (const label of ["Bulanan", "Paket 3 bulan", "Paket 6 bulan", "Paket 12 bulan"]) {
      expect(markup).toContain(label);
    }
    for (const price of ["Rp49.000", "Rp129.000", "Rp229.000", "Rp399.000"]) {
      expect(markup).toContain(price);
    }
  });

  it("shows the current plan and whether it is already active", () => {
    const active = render("bulanan", "active");
    expect(active).toContain("Bulanan");
    expect(active).toContain("aktif");

    const pending = render("bundle", "pending");
    expect(pending).toContain("menunggu pembayaran");

    expect(render("free", "active")).toContain("Gratis");
  });
});
