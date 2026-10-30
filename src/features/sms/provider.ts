import "server-only";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

/**
 * SMS abstraction (phone verification, order alerts). `console` logs in development only;
 * `africastalking` uses Africa's Talking — widely used for Kenyan bulk SMS/OTP.
 */
export async function sendSms(to: string, message: string) {
  const e = env();
  if (e.SMS_PROVIDER === "africastalking") {
    if (!e.AFRICASTALKING_USERNAME || !e.AFRICASTALKING_API_KEY) throw new Error("Africa's Talking is not configured");
    const host = e.AFRICASTALKING_USERNAME === "sandbox" ? "api.sandbox.africastalking.com" : "api.africastalking.com";
    const body = new URLSearchParams({ username: e.AFRICASTALKING_USERNAME, to, message, ...(e.AFRICASTALKING_SENDER_ID ? { from: e.AFRICASTALKING_SENDER_ID } : {}) });
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: "POST",
      headers: { apiKey: e.AFRICASTALKING_API_KEY, accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`SMS send failed (${res.status})`);
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("SMS_PROVIDER=console is not allowed in production");
  // Development only: codes appear in the server log.
  logger.info({ to, message }, "sms (console provider)");
}
