import { z } from "zod";
import { ApiError } from "./http.js";

export interface DeliveryZone {
  id: string;
  name: string;
  feeAmount: number;
}
export interface StoreSettings {
  businessName: string;
  serviceArea: string;
  whatsappNumber: string;
  preorderDays: number[];
  minimumLeadDays: number | null;
  checkoutEnabled: boolean;
  pickupEnabled: boolean;
  pickupDetails: string;
  deliveryEnabled: boolean;
  currencyCode: string | null;
  deliveryZones: DeliveryZone[];
  operatingHours: string;
  currentPolicies: string;
  settingsConfirmed: boolean;
}

export const defaultSettings: StoreSettings = {
  businessName: "Your Foodie Friend",
  serviceArea: "Port Harcourt, Rivers State, Nigeria",
  whatsappNumber: "+2348137523400",
  preorderDays: [0, 2, 4, 5],
  minimumLeadDays: null,
  checkoutEnabled: false,
  pickupEnabled: false,
  pickupDetails: "",
  deliveryEnabled: false,
  currencyCode: null,
  deliveryZones: [],
  operatingHours: "",
  currentPolicies: "",
  settingsConfirmed: false,
};

const currency = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code.")
  .nullable();
const money = z.number().int().min(0).max(1_000_000_000);
const secureImageUrl = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .refine(value => {
    if (value === null || value === "") return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Image URLs must use HTTPS.");

export const productSchema = z
  .object({
    id: z.string().max(64).optional(),
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(60),
    description: z.string().trim().max(700).nullable(),
    sourcePriceText: z.string().trim().max(100).default(""),
    priceAmount: money.nullable(),
    currencyCode: currency,
    imageUrl: secureImageUrl,
    reviewStatus: z.enum(["needs_review", "confirmed"]),
    published: z.boolean(),
    available: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.reviewStatus === "confirmed" &&
      (!value.priceAmount || !value.currencyCode)
    )
      context.addIssue({
        code: "custom",
        message: "A confirmed item needs a current price and currency.",
      });
    if (
      (value.published || value.available) &&
      value.reviewStatus !== "confirmed"
    )
      context.addIssue({
        code: "custom",
        message: "Review an item before publishing or making it available.",
      });
  });

export const settingsSchema = z.object({
  preorderDays: z.array(z.number().int().min(0).max(6)).max(7),
  minimumLeadDays: z.number().int().min(0).max(90).nullable(),
  checkoutEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  pickupDetails: z.string().trim().max(500),
  deliveryEnabled: z.boolean(),
  currencyCode: currency,
  deliveryZones: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(100),
        feeAmount: money,
      })
    )
    .max(100),
  operatingHours: z.string().trim().max(500),
  currentPolicies: z.string().trim().max(2000),
  settingsConfirmed: z.boolean(),
});

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(
      /^[\p{L}\p{N}][\p{L}\p{N} &'’().-]*$/u,
      "Use a clear category name without control characters."
    ),
  isEnabled: z.boolean().optional(),
});

export const slotSchema = z
  .object({
    serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    capacity: z.number().int().min(1).max(200),
    fulfillment: z.enum(["pickup", "delivery", "both"]),
  })
  .refine(value => value.endTime > value.startTime, {
    message: "End time must be later than start time.",
  });

export const orderSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().min(1).max(50),
        })
      )
      .min(1)
      .max(30),
    slotId: z.string().uuid(),
    fulfillment: z.enum(["pickup", "delivery"]),
    customerName: z.string().trim().min(1).max(100),
    customerPhone: z
      .string()
      .trim()
      .min(7)
      .max(24)
      .regex(/^[+\d() .-]+$/),
    deliveryAddress: z.string().trim().max(300).optional(),
    deliveryZoneId: z.string().uuid().optional(),
    notes: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((value, context) => {
    if (
      value.fulfillment === "delivery" &&
      (!value.deliveryAddress || !value.deliveryZoneId)
    )
      context.addIssue({
        code: "custom",
        message: "Delivery requires an area and address.",
      });
    if (
      value.fulfillment === "pickup" &&
      (value.deliveryAddress || value.deliveryZoneId)
    )
      context.addIssue({
        code: "custom",
        message: "Pickup must not include delivery fields.",
      });
    if (
      new Set(value.items.map(item => item.productId)).size !==
      value.items.length
    )
      context.addIssue({
        code: "custom",
        message: "Each product must appear only once.",
      });
  });

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});
export const orderStatusSchema = z.object({
  status: z.enum([
    "awaiting_whatsapp",
    "pending_business_acceptance",
    "accepted",
    "rejected",
    "preparing",
    "dispatched",
    "completed",
    "cancelled",
  ]),
});
export const slotStatusSchema = z.object({ isOpen: z.boolean() });

export function validateSettingsForOpen(settings: StoreSettings): void {
  if (!settings.settingsConfirmed)
    throw new ApiError(
      400,
      "Confirm the current schedule, hours, fulfillment and policies before opening orders.",
      "settings_unconfirmed"
    );
  if (!settings.currencyCode)
    throw new ApiError(
      400,
      "Set and confirm the current menu currency first.",
      "currency_missing"
    );
  if (
    !settings.preorderDays.length ||
    settings.minimumLeadDays === null ||
    !settings.operatingHours ||
    !settings.currentPolicies
  )
    throw new ApiError(
      400,
      "Complete the current preorder days, lead time, hours and policies first.",
      "settings_incomplete"
    );
  if (settings.pickupEnabled && !settings.pickupDetails)
    throw new ApiError(
      400,
      "Add confirmed pickup details before enabling pickup.",
      "pickup_details_missing"
    );
  if (settings.deliveryEnabled && settings.deliveryZones.length === 0)
    throw new ApiError(
      400,
      "Add at least one confirmed delivery area and fee before enabling delivery.",
      "delivery_zones_missing"
    );
  if (!settings.pickupEnabled && !settings.deliveryEnabled)
    throw new ApiError(
      400,
      "Enable pickup or delivery before opening orders.",
      "fulfillment_missing"
    );
}
