export type FulfillmentMode = "pickup" | "delivery";

export interface MenuProduct {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sourcePriceText: string;
  priceAmount: number | null;
  currencyCode: string | null;
  imageUrl: string | null;
  reviewStatus: "needs_review" | "confirmed";
  published: boolean;
  available: boolean;
}

export interface AdminCategory {
  id: string;
  name: string;
  isEnabled: boolean;
  productCount: number;
}

export interface DeliveryZone {
  id: string;
  name: string;
  feeAmount: number;
}
export interface PublicSettings {
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
export interface PublicMenu {
  products: MenuProduct[];
  categories: string[];
  settings: PublicSettings;
}
export interface AvailabilitySlot {
  id: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  fulfillment: string;
  remainingCapacity: number;
  isOpen: boolean;
}
export interface CreateOrderInput {
  items: Array<{ productId: string; quantity: number }>;
  slotId: string;
  fulfillment: FulfillmentMode;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  deliveryZoneId?: string;
  notes?: string;
  idempotencyKey: string;
}
export interface OrderLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
export interface OrderRecord {
  id: string;
  orderReference: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  notes?: string;
  fulfillment: string;
  serviceDate: string;
  startTime: string;
  status: string;
  items: OrderLine[];
  subtotalAmount: number;
  deliveryFeeAmount: number;
  totalAmount: number;
  currencyCode: string;
}
export interface AdminSnapshot {
  products: MenuProduct[];
  categories: AdminCategory[];
  slots: AvailabilitySlot[];
  orders: OrderRecord[];
  settings: PublicSettings;
}
