import { z } from "zod";
import { addressSchema } from "./account";

export const PAYMENT_METHODS = ["MPESA", "CARD", "PAYPAL", "SANDBOX"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const checkoutSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
    customerName: z.string().trim().min(2, "Enter your name").max(80),
    phone: z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, "Enter a valid phone number"),
    savedAddressId: z.string().optional(),
    address: addressSchema.omit({ isDefault: true, label: true }).optional(),
    saveAddress: z.boolean().default(false),
    shippingMethod: z.enum(["standard", "express", "pickup"]),
    paymentMethod: z.enum(PAYMENT_METHODS),
    mpesaPhone: z
      .string()
      .trim()
      .regex(/^(?:\+?254|0)?7\d{8}$|^(?:\+?254|0)?1\d{8}$/, "Enter a valid Safaricom number")
      .optional()
      .or(z.literal("")),
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().min(16).max(64),
  })
  .superRefine((d, ctx) => {
    if (d.shippingMethod !== "pickup" && !d.savedAddressId && !d.address) {
      ctx.addIssue({ code: "custom", message: "Add a delivery address", path: ["address"] });
    }
    if (d.paymentMethod === "MPESA" && !d.mpesaPhone) {
      ctx.addIssue({ code: "custom", message: "Enter the M-Pesa phone number", path: ["mpesaPhone"] });
    }
  });

export type CheckoutInput = z.input<typeof checkoutSchema>;
