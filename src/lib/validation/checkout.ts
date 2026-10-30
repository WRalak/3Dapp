import { z } from "zod";
import { addressSchema } from "./account";

export const PAYMENT_METHODS = ["MPESA", "CARD", "PAYPAL", "SANDBOX"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const deliveryAddress = addressSchema.omit({ isDefault: true, label: true });

export const checkoutSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
    customerName: z.string().trim().min(2, "Enter your name").max(80),
    phone: z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/, "Enter a valid phone number"),
    savedAddressId: z.string().optional(),
    // Lenient here; validated strictly below only when delivery actually needs an address
    // (studio pickup and saved addresses ignore any half-filled form fields).
    address: z
      .object({
        fullName: z.string(),
        phone: z.string(),
        line1: z.string(),
        line2: z.string(),
        city: z.string(),
        region: z.string(),
        postalCode: z.string(),
        country: z.string(),
      })
      .partial()
      .optional(),
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
    if (d.shippingMethod !== "pickup" && !d.savedAddressId) {
      if (!d.address) ctx.addIssue({ code: "custom", message: "Add a delivery address", path: ["address"] });
      else {
        const r = deliveryAddress.safeParse(d.address);
        if (!r.success) for (const issue of r.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: ["address", ...issue.path] });
      }
    }
    if (d.paymentMethod === "MPESA" && !d.mpesaPhone) {
      ctx.addIssue({ code: "custom", message: "Enter the M-Pesa phone number", path: ["mpesaPhone"] });
    }
  })
  .transform((d) => ({
    ...d,
    address: d.shippingMethod !== "pickup" && !d.savedAddressId && d.address ? deliveryAddress.parse(d.address) : undefined,
  }));

export type CheckoutInput = z.input<typeof checkoutSchema>;
