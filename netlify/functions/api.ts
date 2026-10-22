import { randomUUID } from "node:crypto";
import { getDatabase, MissingDatabaseConnectionError } from "@netlify/database";
import { z } from "zod";
import {
  allowAttempt,
  createSession,
  expiredSessionCookie,
  requireAdmin,
  resetAttempts,
  revokeSession,
  sessionCookie,
  validateSession,
  verifyAdminPassword,
} from "./lib/auth.js";
import { withDb, inTransaction, type SqlClient } from "./lib/db.js";
import {
  categorySchema,
  defaultSettings,
  loginSchema,
  orderSchema,
  orderStatusSchema,
  productSchema,
  settingsSchema,
  slotSchema,
  slotStatusSchema,
  validateSettingsForOpen,
  type StoreSettings,
} from "./lib/domain.js";
import {
  ApiError,
  assertOrigin,
  json,
  methodNotAllowed,
  readJson,
} from "./lib/http.js";

export const config = { path: "/api/*" };

type DbRow = Record<string, any>;
const isoLocalToday = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const isoLocalTime = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find(item => item.type === type)?.value ?? "00";
  return `${part("hour")}:${part("minute")}`;
};
const dateDayIndex = (value: string) =>
  (new Date(`${value}T00:00:00Z`).getUTCDay() + 6) % 7;
const moneyText = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-NG")}`;
  }
};
const moneySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(value => {
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: value });
      return true;
    } catch {
      return false;
    }
  }, "Unsupported currency code.");

function mapProduct(row: DbRow) {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    description: String(row.description ?? ""),
    sourcePriceText: String(row.source_price_text ?? ""),
    priceAmount: row.price_amount === null ? null : Number(row.price_amount),
    currencyCode: row.currency_code ? String(row.currency_code).trim() : null,
    imageUrl: row.image_url ?? null,
    reviewStatus: row.review_status,
    published: Boolean(row.is_published),
    available: Boolean(row.is_available),
  };
}

async function readSettings(
  client: SqlClient,
  includeDisabledZones = false
): Promise<StoreSettings> {
  const [settingsResult, zonesResult] = await Promise.all([
    client.query<{ settings: Record<string, unknown> }>(
      "SELECT settings FROM business_settings WHERE id=1"
    ),
    client.query<DbRow>(
      `SELECT id, name, fee_amount FROM delivery_zones ${includeDisabledZones ? "" : "WHERE is_enabled=TRUE AND confirmed_at IS NOT NULL"} ORDER BY name`
    ),
  ]);
  if (!settingsResult.rows[0])
    throw new ApiError(
      503,
      "The business database has not been initialized yet.",
      "database_uninitialized"
    );
  const raw = settingsResult.rows[0].settings ?? {};
  const deliveryZones = zonesResult.rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    feeAmount: Number(row.fee_amount),
  }));
  return { ...defaultSettings, ...raw, deliveryZones } as StoreSettings;
}

function settingsForPublic(
  settings: StoreSettings,
  orderReady: boolean
): StoreSettings {
  const confirmed = Boolean(settings.settingsConfirmed);
  return {
    businessName: "Your Foodie Friend",
    serviceArea: "Port Harcourt, Rivers State, Nigeria",
    whatsappNumber: "+2348137523400",
    preorderDays: settings.preorderDays,
    minimumLeadDays: confirmed ? settings.minimumLeadDays : null,
    checkoutEnabled: Boolean(
      settings.checkoutEnabled && confirmed && orderReady
    ),
    pickupEnabled: Boolean(settings.pickupEnabled && confirmed),
    pickupDetails: confirmed ? settings.pickupDetails : "",
    deliveryEnabled: Boolean(settings.deliveryEnabled && confirmed),
    currencyCode: settings.currencyCode,
    deliveryZones: settings.deliveryZones,
    operatingHours: confirmed ? settings.operatingHours : "",
    currentPolicies: confirmed ? settings.currentPolicies : "",
    settingsConfirmed: confirmed,
  };
}

async function getPublishedProducts(client: SqlClient) {
  const result = await client.query<DbRow>(
    `SELECT p.id,p.name,c.name AS category,p.description,p.source_price_text,p.price_amount,p.currency_code,p.image_url,p.review_status,p.is_published,p.is_available
       FROM products p JOIN categories c ON c.id=p.category_id
      WHERE c.is_enabled=TRUE AND p.is_published=TRUE ORDER BY c.sort_order,c.name,p.name`
  );
  return result.rows.map(mapProduct);
}

async function menuRoute() {
  return withDb(async client => {
    const settings = await readSettings(client);
    const [products, readiness] = await Promise.all([
      getPublishedProducts(client),
      client.query<{ ready: boolean }>(
        `SELECT
        EXISTS(SELECT 1 FROM products p JOIN categories c ON c.id=p.category_id WHERE c.is_enabled=TRUE AND p.is_published=TRUE AND p.is_available=TRUE AND p.review_status='confirmed' AND p.price_amount>0 AND p.currency_code=$3) AND
        EXISTS(SELECT 1 FROM availability_slots WHERE is_open=TRUE AND service_date >= CURRENT_DATE + $1::integer AND service_date <= CURRENT_DATE + 60 AND (EXTRACT(ISODOW FROM service_date)::integer - 1) = ANY($2::integer[]) AND reserved_orders < max_orders AND (service_date > CURRENT_DATE OR start_time > LOCALTIME) AND ((fulfillment_mode='both' AND ($4::boolean OR $5::boolean)) OR (fulfillment_mode='pickup' AND $4::boolean) OR (fulfillment_mode='delivery' AND $5::boolean))) AS ready`,
        [
          settings.minimumLeadDays ?? 0,
          settings.preorderDays,
          settings.currencyCode,
          settings.pickupEnabled,
          settings.deliveryEnabled,
        ]
      ),
    ]);
    const publicProducts = products.filter(product => product.available);
    const categories = [
      ...new Set(publicProducts.map(product => product.category)),
    ];
    return json({
      products: publicProducts,
      categories,
      settings: settingsForPublic(settings, Boolean(readiness.rows[0]?.ready)),
    });
  });
}

async function availabilityRoute() {
  return withDb(async client => {
    const settings = await readSettings(client);
    if (!settings.checkoutEnabled || !settings.settingsConfirmed)
      return json([]);
    const result = await client.query<DbRow>(
      `SELECT id,service_date::text AS service_date,to_char(start_time,'HH24:MI') AS start_time,
              to_char(end_time,'HH24:MI') AS end_time,fulfillment_mode,max_orders-reserved_orders AS remaining_capacity,is_open
         FROM availability_slots
        WHERE is_open=TRUE AND service_date >= CURRENT_DATE + $1::integer AND service_date <= CURRENT_DATE + 60
          AND (EXTRACT(ISODOW FROM service_date)::integer - 1) = ANY($2::integer[])
          AND reserved_orders < max_orders AND (service_date > CURRENT_DATE OR start_time > LOCALTIME)
          AND ((fulfillment_mode='both' AND ($3::boolean OR $4::boolean)) OR (fulfillment_mode='pickup' AND $3::boolean) OR (fulfillment_mode='delivery' AND $4::boolean))
        ORDER BY service_date,start_time LIMIT 300`,
      [
        settings.minimumLeadDays ?? 0,
        settings.preorderDays,
        settings.pickupEnabled,
        settings.deliveryEnabled,
      ]
    );
    return json(
      result.rows.map(slot => ({
        id: slot.id,
        serviceDate: slot.service_date,
        startTime: slot.start_time,
        endTime: slot.end_time,
        fulfillment: slot.fulfillment_mode,
        remainingCapacity: Number(slot.remaining_capacity),
        isOpen: Boolean(slot.is_open),
      }))
    );
  });
}

async function adminDashboard() {
  return withDb(async client => {
    const [settings, productRows, categoryRows, slotRows, orderRows] =
      await Promise.all([
        readSettings(client, true),
        client.query<DbRow>(
          `SELECT p.id,p.name,c.name AS category,p.description,p.source_price_text,p.price_amount,p.currency_code,p.image_url,p.review_status,p.is_published,p.is_available FROM products p JOIN categories c ON c.id=p.category_id ORDER BY c.sort_order,c.name,p.name`
        ),
        client.query<DbRow>(
          `SELECT c.id,c.name,c.is_enabled,COUNT(p.id)::text AS product_count FROM categories c LEFT JOIN products p ON p.category_id=c.id GROUP BY c.id ORDER BY c.sort_order,c.name`
        ),
        client.query<DbRow>(
          `SELECT id,service_date::text AS service_date,to_char(start_time,'HH24:MI') AS start_time,to_char(end_time,'HH24:MI') AS end_time,fulfillment_mode,max_orders-reserved_orders AS remaining_capacity,is_open FROM availability_slots WHERE service_date >= CURRENT_DATE AND (service_date > CURRENT_DATE OR end_time > LOCALTIME) ORDER BY service_date,start_time LIMIT 200`
        ),
        client.query<DbRow>(
          `SELECT o.id,o.order_reference,o.created_at,o.customer_name,o.customer_phone,o.delivery_address,o.notes,o.fulfillment,o.service_date::text AS service_date,to_char(o.start_time,'HH24:MI') AS start_time,o.status,o.subtotal_amount,o.delivery_fee_amount,o.total_amount,o.currency_code,COALESCE(json_agg(json_build_object('name',oi.product_name,'quantity',oi.quantity,'unitPrice',oi.unit_price,'lineTotal',oi.line_total)) FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200`
        ),
      ]);
    const products = productRows.rows.map(mapProduct);
    const categories = categoryRows.rows.map(row => ({
      id: String(row.id),
      name: String(row.name),
      isEnabled: Boolean(row.is_enabled),
      productCount: Number(row.product_count),
    }));
    const slots = slotRows.rows.map(slot => ({
      id: String(slot.id),
      serviceDate: String(slot.service_date),
      startTime: String(slot.start_time),
      endTime: String(slot.end_time),
      fulfillment: String(slot.fulfillment_mode),
      remainingCapacity: Number(slot.remaining_capacity),
      isOpen: Boolean(slot.is_open),
    }));
    const orders = orderRows.rows.map(row => ({
      id: String(row.id),
      orderReference: String(row.order_reference),
      createdAt: new Date(row.created_at).toISOString(),
      customerName: String(row.customer_name),
      customerPhone: String(row.customer_phone),
      deliveryAddress: row.delivery_address ?? null,
      notes: String(row.notes ?? ""),
      fulfillment: String(row.fulfillment),
      serviceDate: String(row.service_date),
      startTime: String(row.start_time),
      status: String(row.status),
      items: Array.isArray(row.items)
        ? row.items.map((item: DbRow) => ({
            name: String(item.name),
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            lineTotal: Number(item.lineTotal),
          }))
        : [],
      subtotalAmount: Number(row.subtotal_amount),
      deliveryFeeAmount: Number(row.delivery_fee_amount),
      totalAmount: Number(row.total_amount),
      currencyCode: String(row.currency_code).trim(),
    }));
    return json({ products, categories, slots, orders, settings });
  });
}

async function categoryId(client: SqlClient, name: string): Promise<string> {
  const existing = await client.query<{ id: string }>(
    "SELECT id FROM categories WHERE LOWER(name)=LOWER($1) LIMIT 1",
    [name]
  );
  if (existing.rows[0]) {
    await client.query("UPDATE categories SET is_enabled=TRUE WHERE id=$1", [
      existing.rows[0].id,
    ]);
    return existing.rows[0].id;
  }
  const result = await client.query<{ id: string }>(
    `INSERT INTO categories(name,sort_order,is_enabled) VALUES($1,99,TRUE)
     ON CONFLICT(name) DO UPDATE SET is_enabled=TRUE RETURNING id`,
    [name]
  );
  return result.rows[0].id;
}

async function categoryMutation(request: Request, categoryId?: string) {
  assertOrigin(request, "ADMIN_ORIGIN");
  await requireAdmin(request);
  const input = await readJson(request, categorySchema);
  return withDb(async client =>
    inTransaction(client, async () => {
      if (!categoryId) {
        const duplicate = await client.query(
          "SELECT 1 FROM categories WHERE LOWER(name)=LOWER($1)",
          [input.name]
        );
        if (duplicate.rows.length)
          throw new ApiError(
            409,
            "A category with that name already exists.",
            "duplicate_category"
          );
        const result = await client.query<DbRow>(
          "INSERT INTO categories(name,sort_order,is_enabled) VALUES($1,99,TRUE) RETURNING id,name,is_enabled",
          [input.name]
        );
        return json(
          {
            category: {
              id: String(result.rows[0].id),
              name: String(result.rows[0].name),
              isEnabled: Boolean(result.rows[0].is_enabled),
              productCount: 0,
            },
          },
          201
        );
      }
      if (!z.string().uuid().safeParse(categoryId).success)
        throw new ApiError(
          400,
          "Invalid category reference.",
          "invalid_category_id"
        );
      const currentResult = await client.query<DbRow>(
        "SELECT id,name,is_enabled FROM categories WHERE id=$1 FOR UPDATE",
        [categoryId]
      );
      const current = currentResult.rows[0];
      if (!current)
        throw new ApiError(404, "Category not found.", "category_not_found");
      const duplicate = await client.query(
        "SELECT 1 FROM categories WHERE LOWER(name)=LOWER($1) AND id<>$2",
        [input.name, categoryId]
      );
      if (duplicate.rows.length)
        throw new ApiError(
          409,
          "A category with that name already exists.",
          "duplicate_category"
        );
      const enabled = input.isEnabled ?? Boolean(current.is_enabled);
      const countResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM products WHERE category_id=$1",
        [categoryId]
      );
      const productCount = Number(countResult.rows[0]?.count ?? 0);
      if (!enabled && productCount > 0)
        throw new ApiError(
          409,
          "Move the menu items to another category before archiving this one.",
          "category_has_products"
        );
      const result = await client.query<DbRow>(
        "UPDATE categories SET name=$2,is_enabled=$3 WHERE id=$1 RETURNING id,name,is_enabled",
        [categoryId, input.name, enabled]
      );
      return json({
        category: {
          id: String(result.rows[0].id),
          name: String(result.rows[0].name),
          isEnabled: Boolean(result.rows[0].is_enabled),
          productCount,
        },
      });
    })
  );
}

async function productMutation(request: Request, productId?: string) {
  assertOrigin(request, "ADMIN_ORIGIN");
  await requireAdmin(request);
  const parsed = await readJson(request, productSchema);
  if (
    parsed.currencyCode &&
    !moneySchema.safeParse(parsed.currencyCode).success
  )
    throw new ApiError(
      400,
      "Enter a supported three-letter currency code.",
      "currency_invalid"
    );
  return withDb(async client => {
    const settings = await readSettings(client);
    if (
      (parsed.published || parsed.available) &&
      parsed.currencyCode !== settings.currencyCode
    )
      throw new ApiError(
        409,
        "Published menu items must use the currently confirmed storefront currency.",
        "product_currency_mismatch"
      );
    if (productId) {
      const existing = await client.query(
        "SELECT 1 FROM products WHERE id=$1",
        [productId]
      );
      if (!existing.rows.length)
        throw new ApiError(404, "Menu item not found.", "product_not_found");
    }
    const category = await categoryId(client, parsed.category);
    const id = productId ?? randomUUID();
    const values = [
      id,
      category,
      parsed.name,
      parsed.description ?? "",
      parsed.sourcePriceText ?? "",
      parsed.priceAmount,
      parsed.currencyCode,
      parsed.imageUrl || null,
      parsed.reviewStatus,
      parsed.published,
      parsed.available,
    ];
    const result = await client.query<DbRow>(
      `INSERT INTO products(id,category_id,name,description,source_price_text,price_amount,currency_code,image_url,review_status,is_published,is_available)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(id) DO UPDATE SET category_id=EXCLUDED.category_id,name=EXCLUDED.name,description=EXCLUDED.description,source_price_text=EXCLUDED.source_price_text,price_amount=EXCLUDED.price_amount,currency_code=EXCLUDED.currency_code,image_url=EXCLUDED.image_url,review_status=EXCLUDED.review_status,is_published=EXCLUDED.is_published,is_available=EXCLUDED.is_available,updated_at=NOW()
       RETURNING id,name,description,source_price_text,price_amount,currency_code,image_url,review_status,is_published,is_available`,
      values
    );
    return json({
      product: mapProduct({ ...result.rows[0], category: parsed.category }),
    });
  });
}

async function settingsMutation(request: Request) {
  assertOrigin(request, "ADMIN_ORIGIN");
  await requireAdmin(request);
  const parsed = await readJson(request, settingsSchema);
  if (
    parsed.currencyCode &&
    !moneySchema.safeParse(parsed.currencyCode).success
  )
    throw new ApiError(
      400,
      "Enter a supported three-letter currency code.",
      "currency_invalid"
    );
  const uniqueZoneNames = new Set(
    parsed.deliveryZones.map(zone => zone.name.toLocaleLowerCase())
  );
  if (uniqueZoneNames.size !== parsed.deliveryZones.length)
    throw new ApiError(
      400,
      "Delivery area names must be unique.",
      "duplicate_delivery_zone"
    );
  if (
    parsed.settingsConfirmed &&
    (!parsed.preorderDays.length ||
      parsed.minimumLeadDays === null ||
      !parsed.operatingHours ||
      !parsed.currentPolicies)
  )
    throw new ApiError(
      400,
      "Confirm the preorder days, lead time, current hours and policies before marking settings reviewed.",
      "settings_incomplete"
    );
  if (parsed.pickupEnabled && !parsed.pickupDetails)
    throw new ApiError(
      400,
      "Add confirmed pickup details before enabling pickup.",
      "pickup_details_missing"
    );
  if (parsed.deliveryEnabled && !parsed.deliveryZones.length)
    throw new ApiError(
      400,
      "Add a delivery area and fee before enabling delivery.",
      "delivery_zones_missing"
    );
  return withDb(async client =>
    inTransaction(client, async () => {
      const currentResult = await client.query<{
        settings: Record<string, unknown>;
      }>("SELECT settings FROM business_settings WHERE id=1 FOR UPDATE");
      if (!currentResult.rows[0])
        throw new ApiError(
          503,
          "The business database has not been initialized yet.",
          "database_uninitialized"
        );
      const current = {
        ...defaultSettings,
        ...currentResult.rows[0].settings,
      } as StoreSettings;
      const currencyMismatch = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM products WHERE is_published=TRUE AND currency_code IS DISTINCT FROM $1",
        [parsed.currencyCode]
      );
      if (Number(currencyMismatch.rows[0]?.count ?? 0) > 0)
        throw new ApiError(
          409,
          "Unpublish or update published menu items before changing the storefront currency.",
          "published_currency_mismatch"
        );
      const existingZones = await client.query<DbRow>(
        "SELECT id,name FROM delivery_zones FOR UPDATE"
      );
      const existingIds = new Set(
        existingZones.rows.map(zone => String(zone.id))
      );
      for (const zone of parsed.deliveryZones) {
        if (existingIds.has(zone.id)) {
          await client.query(
            "UPDATE delivery_zones SET name=$2,fee_amount=$3,is_enabled=TRUE,confirmed_at=NOW(),updated_at=NOW() WHERE id=$1",
            [zone.id, zone.name, zone.feeAmount]
          );
        } else {
          await client.query(
            "INSERT INTO delivery_zones(id,name,fee_amount,is_enabled,confirmed_at) VALUES($1,$2,$3,TRUE,NOW())",
            [zone.id, zone.name, zone.feeAmount]
          );
        }
      }
      const submittedIds = parsed.deliveryZones.map(zone => zone.id);
      if (submittedIds.length)
        await client.query(
          "UPDATE delivery_zones SET is_enabled=FALSE,updated_at=NOW() WHERE NOT(id = ANY($1::uuid[]))",
          [submittedIds]
        );
      else
        await client.query(
          "UPDATE delivery_zones SET is_enabled=FALSE,updated_at=NOW()"
        );
      const zones = parsed.deliveryZones.map(zone => ({
        id: zone.id,
        name: zone.name,
        feeAmount: zone.feeAmount,
      }));
      const updated: StoreSettings = {
        ...current,
        ...parsed,
        deliveryZones: zones,
      };
      if (updated.checkoutEnabled) {
        validateSettingsForOpen(updated);
        const [products, slots] = await Promise.all([
          client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM products p JOIN categories c ON c.id=p.category_id WHERE c.is_enabled=TRUE AND p.is_published=TRUE AND p.is_available=TRUE AND p.review_status='confirmed' AND p.price_amount>0 AND p.currency_code=$1",
            [updated.currencyCode]
          ),
          client.query<{ count: string }>(
            "SELECT COUNT(*)::text AS count FROM availability_slots WHERE is_open=TRUE AND service_date >= CURRENT_DATE + $1::integer AND service_date <= CURRENT_DATE + 60 AND (EXTRACT(ISODOW FROM service_date)::integer - 1) = ANY($2::integer[]) AND reserved_orders < max_orders AND (service_date > CURRENT_DATE OR start_time > LOCALTIME) AND ((fulfillment_mode='both' AND ($3::boolean OR $4::boolean)) OR (fulfillment_mode='pickup' AND $3::boolean) OR (fulfillment_mode='delivery' AND $4::boolean))",
            [
              updated.minimumLeadDays ?? 0,
              updated.preorderDays,
              updated.pickupEnabled,
              updated.deliveryEnabled,
            ]
          ),
        ]);
        if (Number(products.rows[0]?.count ?? 0) === 0)
          throw new ApiError(
            400,
            "Publish at least one confirmed menu item in the selected currency before opening orders.",
            "no_orderable_products"
          );
        if (Number(slots.rows[0]?.count ?? 0) === 0)
          throw new ApiError(
            400,
            "Add an open preorder slot before opening orders.",
            "no_available_slots"
          );
      }
      const { deliveryZones: _zones, ...persisted } = updated;
      await client.query(
        "UPDATE business_settings SET settings=$1::jsonb,updated_at=NOW() WHERE id=1",
        [JSON.stringify(persisted)]
      );
      return json({ settings: updated });
    })
  );
}

function differenceInDays(first: string, second: string): number {
  const [year, month, day] = first.split("-").map(Number);
  const [year2, month2, day2] = second.split("-").map(Number);
  return Math.round(
    (Date.UTC(year, month, day) - Date.UTC(year2, month2, day2)) / 86_400_000
  );
}

function orderMessage(
  order: DbRow,
  lines: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>,
  zoneName: string | null,
  currency: string
): string {
  const items = lines
    .map(
      line =>
        `• ${line.name} × ${line.quantity} — ${moneyText(line.lineTotal, currency)}`
    )
    .join("\n");
  const details = [
    `Hello Your Foodie Friend, I would like to request order ${order.order_reference}.`,
    `Date & time: ${order.service_date} at ${String(order.start_time).slice(0, 5)}`,
    `Fulfillment: ${order.fulfillment}${zoneName ? ` · ${zoneName}` : ""}`,
    "",
    "Items:",
    items,
    "",
    `Subtotal: ${moneyText(Number(order.subtotal_amount), currency)}`,
    ...(Number(order.delivery_fee_amount)
      ? [
          `Delivery fee: ${moneyText(Number(order.delivery_fee_amount), currency)}`,
        ]
      : []),
    `Estimated total: ${moneyText(Number(order.total_amount), currency)}`,
    `Name: ${order.customer_name}`,
    `Phone: ${order.customer_phone}`,
    ...(order.delivery_address ? [`Address: ${order.delivery_address}`] : []),
    ...(order.notes ? [`Note: ${order.notes}`] : []),
    "",
    "This is a preorder request, not a confirmed order. Please reply to accept or let me know if anything needs adjusting.",
  ];
  return details.join("\n");
}

async function savedOrderResponse(
  client: SqlClient,
  idempotencyKey: string
): Promise<Response | null> {
  const existing = await client.query<DbRow>(
    "SELECT * FROM orders WHERE idempotency_key=$1",
    [idempotencyKey]
  );
  const row = existing.rows[0];
  if (!row) return null;
  const linesResult = await client.query<DbRow>(
    "SELECT product_name,quantity,unit_price,line_total FROM order_items WHERE order_id=$1 ORDER BY id",
    [row.id]
  );
  const lines = linesResult.rows.map(line => ({
    name: String(line.product_name),
    quantity: Number(line.quantity),
    unitPrice: Number(line.unit_price),
    lineTotal: Number(line.line_total),
  }));
  const message = orderMessage(
    row,
    lines,
    row.delivery_zone_name ?? null,
    String(row.currency_code).trim()
  );
  return json({
    orderId: row.id,
    orderReference: row.order_reference,
    whatsappUrl: `https://wa.me/2348137523400?text=${encodeURIComponent(message)}`,
  });
}

async function createOrderRoute(request: Request) {
  assertOrigin(request, "STOREFRONT_ORIGIN");
  const input = await readJson(request, orderSchema);
  if (!(await allowAttempt(request, "public-order", 12, 60 * 60)))
    throw new ApiError(
      429,
      "Too many requests. Please wait a little and try again.",
      "rate_limited"
    );
  try {
    return await withDb(async client =>
      inTransaction(client, async () => {
        const saved = await savedOrderResponse(client, input.idempotencyKey);
        if (saved) return saved;
        const settings = await readSettings(client);
        if (
          !settings.checkoutEnabled ||
          !settings.settingsConfirmed ||
          !settings.currencyCode
        )
          throw new ApiError(
            409,
            "Online ordering is not open. Please message the business to check availability.",
            "ordering_closed"
          );
        const minimumLead = settings.minimumLeadDays ?? 0;
        const slotResult = await client.query<DbRow>(
          "SELECT id,service_date::text AS service_date,to_char(start_time,'HH24:MI') AS start_time,to_char(end_time,'HH24:MI') AS end_time,fulfillment_mode,max_orders,reserved_orders,is_open FROM availability_slots WHERE id=$1 AND (service_date > CURRENT_DATE OR start_time > LOCALTIME) FOR UPDATE",
          [input.slotId]
        );
        const slot = slotResult.rows[0];
        if (
          !slot ||
          !slot.is_open ||
          Number(slot.reserved_orders) >= Number(slot.max_orders)
        )
          throw new ApiError(
            409,
            "That preorder slot is no longer available.",
            "slot_unavailable"
          );
        const today = isoLocalToday();
        const daysAhead = differenceInDays(String(slot.service_date), today);
        if (daysAhead < minimumLead || daysAhead < 0 || daysAhead > 60)
          throw new ApiError(
            409,
            "Choose a date that meets the current preorder notice period.",
            "lead_time"
          );
        if (
          !settings.preorderDays.includes(
            dateDayIndex(String(slot.service_date))
          )
        )
          throw new ApiError(
            409,
            "That date is not on the confirmed preorder schedule.",
            "preorder_day_unavailable"
          );
        if (
          slot.fulfillment_mode !== "both" &&
          slot.fulfillment_mode !== input.fulfillment
        )
          throw new ApiError(
            409,
            "That slot is not available for this fulfillment option.",
            "fulfillment_unavailable"
          );
        if (
          input.fulfillment === "pickup" &&
          (!settings.pickupEnabled || !settings.pickupDetails)
        )
          throw new ApiError(
            409,
            "Pickup is not available right now.",
            "pickup_unavailable"
          );
        if (input.fulfillment === "delivery" && !settings.deliveryEnabled)
          throw new ApiError(
            409,
            "Delivery is not available right now.",
            "delivery_unavailable"
          );
        let zone: DbRow | null = null;
        if (input.fulfillment === "delivery") {
          const zoneResult = await client.query<DbRow>(
            "SELECT id,name,fee_amount FROM delivery_zones WHERE id=$1 AND is_enabled=TRUE AND confirmed_at IS NOT NULL",
            [input.deliveryZoneId]
          );
          zone = zoneResult.rows[0] ?? null;
          if (!zone)
            throw new ApiError(
              409,
              "Choose a confirmed delivery area.",
              "delivery_zone_unavailable"
            );
        }
        const productIds = input.items.map(item => item.productId);
        const productResult = await client.query<DbRow>(
          `SELECT p.id,p.name,p.price_amount,p.currency_code FROM products p
        WHERE p.id=ANY($1::uuid[]) AND p.is_published=TRUE AND p.is_available=TRUE AND p.review_status='confirmed'`,
          [productIds]
        );
        if (productResult.rows.length !== input.items.length)
          throw new ApiError(
            409,
            "One or more menu items are no longer available.",
            "product_unavailable"
          );
        const byId = new Map(
          productResult.rows.map(product => [String(product.id), product])
        );
        const lines = input.items.map(item => {
          const product = byId.get(item.productId);
          if (
            !product ||
            !product.price_amount ||
            String(product.currency_code).trim() !== settings.currencyCode
          )
            throw new ApiError(
              409,
              "One or more menu prices need to be confirmed again.",
              "price_unavailable"
            );
          const unitPrice = Number(product.price_amount);
          return {
            productId: item.productId,
            name: String(product.name),
            quantity: item.quantity,
            unitPrice,
            lineTotal: unitPrice * item.quantity,
          };
        });
        const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
        const deliveryFee = zone ? Number(zone.fee_amount) : 0;
        const total = subtotal + deliveryFee;
        if (!Number.isSafeInteger(total) || total <= 0)
          throw new ApiError(
            400,
            "The calculated order total is invalid.",
            "invalid_total"
          );
        const id = randomUUID();
        const dateToken = String(slot.service_date).replaceAll("-", "");
        const reference = `YFF-${dateToken}-${id.slice(0, 4).toUpperCase()}`;
        const order = {
          id,
          order_reference: reference,
          service_date: String(slot.service_date),
          start_time: String(slot.start_time),
          fulfillment: input.fulfillment,
          customer_name: input.customerName,
          customer_phone: input.customerPhone,
          delivery_address: input.deliveryAddress ?? null,
          notes: input.notes ?? "",
          subtotal_amount: subtotal,
          delivery_fee_amount: deliveryFee,
          total_amount: total,
          currency_code: settings.currencyCode,
          delivery_zone_name: zone ? String(zone.name) : null,
        };
        await client.query(
          `INSERT INTO orders(id,order_reference,idempotency_key,customer_name,customer_phone,fulfillment,delivery_zone_id,delivery_zone_name,delivery_address,service_date,start_time,slot_id,status,subtotal_amount,delivery_fee_amount,total_amount,currency_code,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'awaiting_whatsapp',$13,$14,$15,$16,$17)`,
          [
            id,
            reference,
            input.idempotencyKey,
            input.customerName,
            input.customerPhone,
            input.fulfillment,
            zone?.id ?? null,
            zone?.name ?? null,
            input.deliveryAddress ?? null,
            slot.service_date,
            slot.start_time,
            slot.id,
            subtotal,
            deliveryFee,
            total,
            settings.currencyCode,
            input.notes ?? "",
          ]
        );
        for (const line of lines)
          await client.query(
            "INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6)",
            [
              id,
              line.productId,
              line.name,
              line.quantity,
              line.unitPrice,
              line.lineTotal,
            ]
          );
        await client.query(
          "UPDATE availability_slots SET reserved_orders=reserved_orders+1,updated_at=NOW() WHERE id=$1",
          [slot.id]
        );
        const message = orderMessage(
          order,
          lines,
          order.delivery_zone_name,
          settings.currencyCode
        );
        return json(
          {
            orderId: id,
            orderReference: reference,
            whatsappUrl: `https://wa.me/2348137523400?text=${encodeURIComponent(message)}`,
          },
          201
        );
      })
    );
  } catch (error) {
    const sqlError = error as { code?: string; constraint?: string };
    if (
      sqlError.code === "23505" &&
      sqlError.constraint === "orders_idempotency_key_key"
    ) {
      return withDb(async client => {
        const saved = await savedOrderResponse(client, input.idempotencyKey);
        if (saved) return saved;
        throw error;
      });
    }
    throw error;
  }
}

async function orderStatusMutation(request: Request, orderId: string) {
  assertOrigin(request, "ADMIN_ORIGIN");
  await requireAdmin(request);
  if (!z.string().uuid().safeParse(orderId).success)
    throw new ApiError(400, "Invalid order reference.", "invalid_order_id");
  const { status } = await readJson(request, orderStatusSchema);
  const transitions: Record<string, string[]> = {
    awaiting_whatsapp: [
      "pending_business_acceptance",
      "accepted",
      "rejected",
      "cancelled",
    ],
    pending_business_acceptance: ["accepted", "rejected", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["dispatched", "completed", "cancelled"],
    dispatched: ["completed"],
    completed: [],
    rejected: [],
    cancelled: [],
  };
  return withDb(async client =>
    inTransaction(client, async () => {
      const currentResult = await client.query<DbRow>(
        "SELECT id,status,slot_id FROM orders WHERE id=$1 FOR UPDATE",
        [orderId]
      );
      const current = currentResult.rows[0];
      if (!current)
        throw new ApiError(404, "Order not found.", "order_not_found");
      if (!transitions[String(current.status)]?.includes(status))
        throw new ApiError(
          409,
          `That status change is not allowed from ${String(current.status).replaceAll("_", " ")}.`,
          "invalid_status_transition"
        );
      await client.query(
        "UPDATE orders SET status=$2,updated_at=NOW(),accepted_at=CASE WHEN $2='accepted' THEN NOW() ELSE accepted_at END WHERE id=$1",
        [orderId, status]
      );
      if (["rejected", "cancelled"].includes(status) && current.slot_id)
        await client.query(
          "UPDATE availability_slots SET reserved_orders=GREATEST(0,reserved_orders-1),updated_at=NOW() WHERE id=$1",
          [current.slot_id]
        );
      const updated = await client.query<DbRow>(
        "SELECT id,order_reference,status FROM orders WHERE id=$1",
        [orderId]
      );
      return json({
        order: {
          id: updated.rows[0].id,
          orderReference: updated.rows[0].order_reference,
          status: updated.rows[0].status,
        },
      });
    })
  );
}

async function slotMutation(request: Request, slotId: string) {
  assertOrigin(request, "ADMIN_ORIGIN");
  await requireAdmin(request);
  if (!z.string().uuid().safeParse(slotId).success)
    throw new ApiError(400, "Invalid slot reference.", "invalid_slot_id");
  const { isOpen } = await readJson(request, slotStatusSchema);
  return withDb(async client => {
    const result = await client.query<DbRow>(
      "UPDATE availability_slots SET is_open=$2,updated_at=NOW() WHERE id=$1 RETURNING id,is_open",
      [slotId, isOpen]
    );
    if (!result.rows[0])
      throw new ApiError(404, "Availability slot not found.", "slot_not_found");
    return json({
      slot: { id: result.rows[0].id, isOpen: Boolean(result.rows[0].is_open) },
    });
  });
}

async function newSlot(request: Request) {
  assertOrigin(request, "ADMIN_ORIGIN");
  await requireAdmin(request);
  const input = await readJson(request, slotSchema);
  return withDb(async client => {
    const settings = await readSettings(client, true);
    const daysAhead = differenceInDays(input.serviceDate, isoLocalToday());
    const minimumLead = settings.minimumLeadDays ?? 0;
    if (
      daysAhead < minimumLead ||
      daysAhead < 0 ||
      daysAhead > 365 ||
      (daysAhead === 0 && input.startTime <= isoLocalTime())
    )
      throw new ApiError(
        400,
        "Choose a future date and time within the next year.",
        "invalid_slot_date"
      );
    if (!settings.preorderDays.includes(dateDayIndex(input.serviceDate)))
      throw new ApiError(
        400,
        "That weekday is not in the current preorder schedule. Confirm settings before adding this slot.",
        "preorder_day_unavailable"
      );
    const result = await client.query<DbRow>(
      `INSERT INTO availability_slots(service_date,start_time,end_time,fulfillment_mode,max_orders)
       VALUES($1,$2,$3,$4,$5) RETURNING id,service_date::text AS service_date,to_char(start_time,'HH24:MI') AS start_time,to_char(end_time,'HH24:MI') AS end_time,fulfillment_mode,max_orders-reserved_orders AS remaining_capacity,is_open`,
      [
        input.serviceDate,
        input.startTime,
        input.endTime,
        input.fulfillment,
        input.capacity,
      ]
    );
    const slot = result.rows[0];
    return json(
      {
        slot: {
          id: slot.id,
          serviceDate: slot.service_date,
          startTime: slot.start_time,
          endTime: slot.end_time,
          fulfillment: slot.fulfillment_mode,
          remainingCapacity: Number(slot.remaining_capacity),
          isOpen: Boolean(slot.is_open),
        },
      },
      201
    );
  });
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();
    if (path === "/api/health" && method === "GET")
      return json({ status: "ok" });
    if (path === "/api/menu" && method === "GET") return await menuRoute();
    if (path === "/api/availability" && method === "GET")
      return await availabilityRoute();
    if (path === "/api/orders" && method === "POST")
      return await createOrderRoute(request);
    if (path === "/api/auth/me" && method === "GET") {
      assertOrigin(request, "ADMIN_ORIGIN");
      return json({ authenticated: Boolean(await validateSession(request)) });
    }
    if (path === "/api/auth/login" && method === "POST") {
      assertOrigin(request, "ADMIN_ORIGIN");
      const credentials = await readJson(request, loginSchema, 4096);
      if (!(await allowAttempt(request, "admin-login", 8, 15 * 60)))
        throw new ApiError(
          429,
          "Too many sign-in attempts. Wait a few minutes and try again.",
          "rate_limited"
        );
      if (!verifyAdminPassword(credentials.email, credentials.password))
        throw new ApiError(
          401,
          "Email or password is incorrect.",
          "login_failed"
        );
      await resetAttempts(request, "admin-login");
      const session = await createSession();
      return json({ authenticated: true }, 200, {
        "Set-Cookie": sessionCookie(session.token),
      });
    }
    if (path === "/api/auth/logout" && method === "POST") {
      assertOrigin(request, "ADMIN_ORIGIN");
      await revokeSession(request);
      return json({ success: true }, 200, {
        "Set-Cookie": expiredSessionCookie(),
      });
    }
    if (path === "/api/admin/dashboard" && method === "GET") {
      assertOrigin(request, "ADMIN_ORIGIN");
      await requireAdmin(request);
      return await adminDashboard();
    }
    if (path === "/api/admin/settings" && method === "PUT")
      return await settingsMutation(request);
    if (path === "/api/admin/products" && method === "POST")
      return await productMutation(request);
    if (path === "/api/admin/categories" && method === "POST")
      return await categoryMutation(request);
    const categoryMatch = path.match(
      /^\/api\/admin\/categories\/([0-9a-f-]{36})$/i
    );
    if (categoryMatch && method === "PATCH")
      return await categoryMutation(request, categoryMatch[1]);
    const productMatch = path.match(
      /^\/api\/admin\/products\/([0-9a-f-]{36})$/i
    );
    if (productMatch && method === "PATCH")
      return await productMutation(request, productMatch[1]);
    if (path === "/api/admin/availability" && method === "POST")
      return await newSlot(request);
    const slotMatch = path.match(
      /^\/api\/admin\/availability\/([0-9a-f-]{36})$/i
    );
    if (slotMatch && method === "PATCH")
      return await slotMutation(request, slotMatch[1]);
    const orderMatch = path.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})$/i);
    if (orderMatch && method === "PATCH")
      return await orderStatusMutation(request, orderMatch[1]);
    if (path.startsWith("/api/"))
      return json({ error: "API route not found." }, 404);
    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof MissingDatabaseConnectionError)
      return json(
        {
          error:
            "The Netlify Database has not been initialized for this site yet.",
          code: "database_unavailable",
        },
        503
      );
    if (error instanceof z.ZodError)
      return json(
        {
          error: "Please check the submitted fields and try again.",
          code: "invalid_input",
        },
        400
      );
    console.error(
      "[your-foodie-friend] API request failed",
      error instanceof Error ? error.name : "unknown"
    );
    return json(
      {
        error:
          "The service could not complete that request. Please try again shortly.",
        code: "internal_error",
      },
      500
    );
  }
}
