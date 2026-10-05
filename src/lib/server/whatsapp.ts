/**
 * WhatsApp sender stub — plan section 6 (weekly digests via WhatsApp
 * Business Cloud API utility templates). Env-gated: without WHATSAPP_TOKEN
 * the sender is a no-op that logs the rendered text, so the whole digest
 * flow is exercisable end to end in dev with zero external calls.
 *
 * With WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID set, this posts a Cloud API
 * text message (stub-quality: production should use an approved *utility*
 * template, not a free-form text — template approval is an open question,
 * plan risk 12). Recipients need the parent's phone, which the schema does
 * not store yet (see deferred notes) — the preview route passes null.
 */

export type WhatsAppSendResult = {
  sent: boolean;
  /** Machine-readable reason when not sent. */
  reason?: "whatsapp_not_configured" | "missing_recipient" | "api_error";
  detail?: string;
};

const GRAPH_API_VERSION = "v21.0";

export async function sendWhatsAppText(
  to: string | null,
  body: string,
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.log(
      `[whatsapp] WHATSAPP_TOKEN absent — no-op send${to ? ` to ${to}` : " (no recipient stored)"}:\n${body}`,
    );
    return { sent: false, reason: "whatsapp_not_configured" };
  }
  if (!to) {
    return { sent: false, reason: "missing_recipient" };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: false, body },
        }),
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      return { sent: false, reason: "api_error", detail };
    }
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: "api_error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
