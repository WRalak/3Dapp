import { z } from "zod";
import { normaliseKenyanPhone } from "@/lib/utils";

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^\+?[0-9\s-]{7,20}$/, "Enter a valid phone number")
    .or(z.literal(""))
    .optional(),
  image: z.string().url().max(500).or(z.literal("")).optional(),
});

/** Kenyan delivery address: county → town → estate/area → building → directions. */
export const addressSchema = z.object({
  label: z.string().trim().max(40).optional().or(z.literal("")),
  fullName: z.string().trim().min(2, "Enter the recipient's name").max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => !!normaliseKenyanPhone(v), "Enter a valid Kenyan mobile number, e.g. 0712 345 678")
    .transform((v) => normaliseKenyanPhone(v)!),
  countyId: z.string().min(1, "Choose a county"),
  town: z.string().trim().min(2, "Enter the town or area").max(80),
  estate: z.string().trim().min(2, "Enter the estate or neighbourhood").max(80),
  building: z.string().trim().max(120).optional().or(z.literal("")),
  line1: z.string().trim().max(120).optional().or(z.literal("")), // street / road
  directions: z.string().trim().max(300).optional().or(z.literal("")),
  isDefault: z.boolean().default(false),
});

export const notificationPrefsSchema = z.object({
  notifyOrderUpdates: z.boolean(),
  notifyPromotions: z.boolean(),
  notifyRestock: z.boolean(),
  notifyDelivery: z.boolean(),
});

export const reviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().min(3, "Add a short title").max(80),
  body: z.string().trim().min(10, "Tell us a little more").max(2000),
});

export const newsletterSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
});

export type AddressInput = z.input<typeof addressSchema>;
export type ProfileInput = z.input<typeof profileSchema>;
