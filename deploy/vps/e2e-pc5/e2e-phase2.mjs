// Phase 2 : webhooks Stripe SIGNÉS (secret du Coffre) — paiement de la commande en mode test.
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const { BASE, ORG, ORDER, CUS, PRICE, TYPE } = process.env;
const secret = readFileSync("/run/whs", "utf8").trim();
const SUB = process.env.SUB || `sub_${randomBytes(6).toString("hex")}`;
const now = Math.floor(Date.now() / 1000);
const meta = { kind: "vps", organization_id: ORG, vps_order_id: ORDER };
const send = async (type, object, created = now) => {
  const event = { id: `evt_pc5_${randomBytes(6).toString("hex")}`, object: "event", api_version: "2026-09-30.endive", created, livemode: false,
    pending_webhooks: 1, request: { id: null, idempotency_key: null }, type, data: { object } };
  const payload = JSON.stringify(event);
  const sig = createHmac("sha256", secret).update(`${created}.${payload}`).digest("hex");
  const r = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${created},v1=${sig}` }, body: payload });
  console.log(type, r.status, await r.text());
  await new Promise((s) => setTimeout(s, 1500));
};
const period = { start: now, end: now + 30 * 86400 };
const invoice = (reason) => ({ id: `in_${randomBytes(4).toString("hex")}`, customer: CUS, billing_reason: reason,
  parent: { subscription_details: { subscription: SUB, metadata: meta } }, lines: { data: [{ period, pricing: { price_details: { price: PRICE } } }] } });
const sub = (status) => ({ id: SUB, customer: CUS, status, cancel_at_period_end: false, metadata: meta,
  items: { data: [{ current_period_start: period.start, current_period_end: period.end, price: { id: PRICE } }] } });
if (TYPE === "pay") {
  await send("checkout.session.completed", { id: "cs_pc5_1", object: "checkout.session", mode: "subscription", payment_status: "paid", client_reference_id: ORG, customer: CUS, subscription: SUB, metadata: meta });
  await send("invoice.paid", invoice("subscription_create"));
} else if (TYPE === "cancel") {
  await send("customer.subscription.deleted", sub("canceled"));
} else if (TYPE === "fail") {
  await send("invoice.payment_failed", invoice("subscription_cycle"));
}
console.log("SUB", SUB);
