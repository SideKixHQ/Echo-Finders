/**
 * POST /api/restore  { email, receipt }  ->  { customerId, entitlement }
 *
 * Restore on a different phone, before there are accounts (James, 2026-11-08: launch item 7).
 * Stripe emails a receipt after every payment (switched on in Stripe the same day), and the
 * receipt carries a receipt number. The email it was sent to and that number together say
 * "this is the person who paid": only they were sent it. So: find the customers with that
 * email, find the payment with that receipt number among theirs, and answer with what that
 * customer owns, exactly as `/api/entitlement` does for the phone that bought.
 *
 * Nothing new is stored and no email is sent. A wrong pair gets the same answer as an
 * unknown email, so this cannot be used to find out who has bought.
 */
import { failure, isCustomerId, reply, stripe, configured } from "./_stripe.js";
import { lookup } from "./_lookup.js";

interface Customer {
  readonly id: string;
}
interface Charge {
  readonly receipt_number: string | null;
  readonly paid: boolean;
}

/** Receipt numbers are written like 1234-5678; people retype them with spaces or without. */
export const normaliseReceipt = (s: string): string => s.replace(/[^0-9a-z]/gi, "").toUpperCase();

const NO_MATCH = "Nothing matches that email and receipt number. Check both against your receipt email from Stripe.";

export async function POST(request: Request): Promise<Response> {
  if (!configured()) return reply(503, { error: "Payments are not switched on yet." });
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; receipt?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const receipt = typeof body.receipt === "string" ? normaliseReceipt(body.receipt) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || receipt.length < 4 || receipt.length > 40) {
    return reply(400, { error: "Enter the email and the receipt number from your receipt." });
  }
  try {
    // Stripe matches the email exactly, so ask for it as typed and in lower case.
    const forms = [...new Set([email, email.toLowerCase()])];
    const lists = await Promise.all(
      forms.map((e) => stripe<{ data: Customer[] }>("GET", "/customers", { email: e, limit: 10 })),
    );
    const customers = [...new Set(lists.flatMap((l) => l.data.map((c) => c.id)))].filter(isCustomerId);
    for (const id of customers) {
      const charges = await stripe<{ data: Charge[] }>("GET", "/charges", { customer: id, limit: 100 });
      const match = charges.data.some((c) => c.paid && c.receipt_number && normaliseReceipt(c.receipt_number) === receipt);
      if (match) return reply(200, { customerId: id, entitlement: await lookup(id) });
    }
    return reply(404, { error: NO_MATCH });
  } catch (error) {
    return failure(error);
  }
}
