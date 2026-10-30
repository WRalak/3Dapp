"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/lib/action";
import { LOCALES, LOCALE_COOKIE } from "@/config/locale";
import { LITE_COOKIE } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/prisma";

const YEAR = 60 * 60 * 24 * 365;

export const setLocaleAction = action(z.object({ locale: z.enum(LOCALES) }), async ({ locale }) => {
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/", "layout");
  return {};
});

export const setLiteModeAction = action(z.object({ enabled: z.boolean() }), async ({ enabled }) => {
  const jar = await cookies();
  if (enabled) jar.set(LITE_COOKIE, "1", { path: "/", maxAge: YEAR, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  else jar.delete(LITE_COOKIE);
  revalidatePath("/", "layout");
  return {};
});
