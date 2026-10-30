import { z } from "zod";
import { normaliseKenyanPhone } from "@/lib/utils";

export const kenyanPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normaliseKenyanPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Kenyan mobile number, e.g. 0712 345 678" });
      return z.NEVER;
    }
    return n;
  });

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => !v || /^https:\/\//.test(v), "Use an https:// link")
  .optional()
  .or(z.literal(""));

export const BUSINESS_TYPES = ["DESIGNER", "BOUTIQUE", "BRAND", "MANUFACTURER", "RETAILER"] as const;

export const sellerApplicationSchema = z.object({
  businessName: z.string().trim().min(2, "Enter your business name").max(80),
  businessType: z.enum(BUSINESS_TYPES),
  contactName: z.string().trim().min(2, "Enter a contact person").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  phone: kenyanPhone,
  countyId: z.string().min(1, "Choose your county"),
  town: z.string().trim().min(2, "Enter your town").max(60),
  description: z.string().trim().min(30, "Tell customers about your brand (at least 30 characters)").max(2000),
  categories: z.array(z.string().max(60)).min(1, "Choose at least one category").max(12),
  website: optionalUrl,
  instagram: z.string().trim().max(60).optional().or(z.literal("")),
  registrationNumber: z.string().trim().max(40).optional().or(z.literal("")),
  kraPin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[AP]\d{9}[A-Z]$/, "KRA PIN looks like A123456789B")
    .optional()
    .or(z.literal("")),
  logoUrl: z.string().max(500).optional().or(z.literal("")),
  coverUrl: z.string().max(500).optional().or(z.literal("")),
  acceptTerms: z.literal(true, { error: "Please accept the seller terms" }),
});

export const storeProfileSchema = sellerApplicationSchema.omit({ acceptTerms: true, businessType: true }).extend({
  returnPolicy: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const payoutDetailsSchema = z
  .object({
    method: z.enum(["MPESA", "BANK_TRANSFER"]),
    mpesaPhone: z.string().optional().or(z.literal("")),
    bankName: z.string().trim().max(80).optional().or(z.literal("")),
    accountName: z.string().trim().max(80).optional().or(z.literal("")),
    accountNumber: z.string().trim().max(40).optional().or(z.literal("")),
  })
  .superRefine((d, ctx) => {
    if (d.method === "MPESA" && !normaliseKenyanPhone(d.mpesaPhone ?? "")) ctx.addIssue({ code: "custom", path: ["mpesaPhone"], message: "Enter the M-Pesa number to pay out to" });
    if (d.method === "BANK_TRANSFER") {
      if (!d.bankName) ctx.addIssue({ code: "custom", path: ["bankName"], message: "Enter the bank" });
      if (!d.accountName) ctx.addIssue({ code: "custom", path: ["accountName"], message: "Enter the account name" });
      if (!d.accountNumber || !/^\d{6,20}$/.test(d.accountNumber)) ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "Enter a valid account number" });
    }
  });

export const DELIVERY_TYPES = ["SAME_DAY", "NEXT_DAY", "STANDARD", "COURIER", "PICKUP", "SELLER_ARRANGED"] as const;

export const deliveryZoneSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(60),
  countyIds: z.array(z.string()).min(1, "Choose at least one county"),
  towns: z.string().max(500).optional().or(z.literal("")), // comma separated
  isActive: z.boolean().default(true),
});

export const shippingMethodSchema = z
  .object({
    id: z.string().optional(),
    zoneId: z.string().min(1),
    type: z.enum(DELIVERY_TYPES),
    name: z.string().trim().min(2).max(60),
    price: z.coerce.number().min(0).max(100_000),
    freeOver: z.union([z.literal(""), z.coerce.number().min(0).max(10_000_000)]).optional(),
    minDays: z.coerce.number().int().min(0).max(60),
    maxDays: z.coerce.number().int().min(0).max(60),
    cutoffHour: z.union([z.literal(""), z.coerce.number().int().min(0).max(23)]).optional(),
    pickupAddress: z.string().trim().max(200).optional().or(z.literal("")),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.maxDays >= d.minDays, { path: ["maxDays"], message: "Must be at least the minimum" })
  .refine((d) => d.type !== "PICKUP" || !!d.pickupAddress, { path: ["pickupAddress"], message: "Where should customers collect from?" });

export const inquirySchema = z.object({
  sellerId: z.string().min(1),
  productId: z.string().optional(),
  subject: z.string().trim().min(3, "Add a subject").max(120),
  message: z.string().trim().min(5, "Write your question").max(2000),
});

export const inquiryReplySchema = z.object({
  inquiryId: z.string().min(1),
  message: z.string().trim().min(1).max(2000),
});

export const reportSchema = z.object({
  productId: z.string().min(1),
  reason: z.enum(["COUNTERFEIT", "MISLEADING", "PROHIBITED", "OFFENSIVE", "INTELLECTUAL_PROPERTY", "OTHER"]),
  details: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const payoutRequestSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount").max(10_000_000),
});

export const phoneVerifySchema = z.object({ phone: kenyanPhone });
export const phoneCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

export const promotionSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  type: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.coerce.number().positive().max(1_000_000),
  sellerIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  endsAt: z.string().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});
