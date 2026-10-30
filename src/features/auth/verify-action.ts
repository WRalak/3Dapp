"use server";

import { z } from "zod";
import { action } from "@/lib/action";
import { verifyEmail } from "@/server/services/auth.service";

export const verifyEmailAction = action(z.object({ token: z.string().min(20).max(200) }), async ({ token }) => {
  await verifyEmail(token);
  return {};
});
