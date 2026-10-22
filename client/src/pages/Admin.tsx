import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleAlert,
  LogOut,
  Menu as MenuIcon,
  Package,
  Plus,
  Save,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  addSlot,
  createCategory,
  createProduct,
  formatMoney,
  getAdminData,
  getAdminSession,
  login,
  logout,
  updateCategory,
  updateOrder,
  updateProduct,
  updateSettings,
  updateSlot,
} from "@/lib/api";
import type {
  AdminCategory,
  AdminSnapshot,
  AvailabilitySlot,
  MenuProduct,
  OrderRecord,
  PublicSettings,
} from "@/lib/types";
import { trapDialog } from "@/lib/dialog";
import { CategoryManager } from "@/components/CategoryManager";

const NAV = [
  { id: "overview", label: "Overview", icon: SlidersHorizontal },
  { id: "menu", label: "Menu review", icon: MenuIcon },
  { id: "availability", label: "Availability", icon: CalendarDays },
  { id: "orders", label: "Orders", icon: ShoppingBag },
  { id: "settings", label: "Business settings", icon: ShieldCheck },
] as const;
type Section = (typeof NAV)[number]["id"];
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function Brand() {
  return (
    <a
      className="admin-brand"
      href={import.meta.env.VITE_STOREFRONT_ORIGIN || "/"}
      aria-label="Your Foodie Friend"
    >
      <span className="brand-mark brand-mark--compact">
        <MenuIcon size={17} />
      </span>
      <span>
        Your Foodie Friend<small>OWNER DASHBOARD</small>
      </span>
    </a>
  );
}
function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function todayInPortHarcourt() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function words(value: string) {
  return value.replaceAll("_", " ");
}

export default function Admin() {
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [section, setSection] = useState<Section>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [editProduct, setEditProduct] = useState<MenuProduct | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [slotDate, setSlotDate] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const [slotCapacity, setSlotCapacity] = useState("");
  const [slotFulfillment, setSlotFulfillment] = useState("");

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await getAdminData());
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The admin API is unavailable."
      );
    }
  }, []);
  useEffect(() => {
    getAdminSession()
      .then(result => setAuthenticated(result.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setChecked(true));
  }, []);
  useEffect(() => {
    if (authenticated) void refresh();
  }, [authenticated, refresh]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      setPassword("");
      setAuthenticated(true);
    } catch (reason) {
      setLoginError(
        reason instanceof Error
          ? reason.message
          : "Sign-in failed. Check your credentials and try again."
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleLogout() {
    setNotice("");
    try {
      await logout();
      setAuthenticated(false);
      setSnapshot(null);
    } catch {
      setNotice(
        "Could not confirm a secure sign-out. Check the connection and try again."
      );
    }
  }
  async function saveProduct(product: MenuProduct) {
    setBusy(true);
    setNotice("");
    try {
      if (product.id.startsWith("draft-")) await createProduct(product);
      else await updateProduct(product.id, product);
      setEditProduct(null);
      setIsNew(false);
      setNotice("Menu item saved.");
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not save the menu item."
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveCategory(name: string, id?: string) {
    setBusy(true);
    setNotice("");
    try {
      if (id)
        await updateCategory(
          id,
          name,
          snapshot?.categories.find(category => category.id === id)
            ?.isEnabled ?? true
        );
      else await createCategory(name);
      setNotice(id ? "Category updated." : "Category added.");
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not save the category."
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggleCategory(category: AdminCategory, isEnabled: boolean) {
    if (!isEnabled && category.productCount > 0) return;
    if (
      !isEnabled &&
      !window.confirm(
        `Archive “${category.name}”? It will stay in historical records and can be restored later.`
      )
    )
      return;
    setBusy(true);
    setNotice("");
    try {
      await updateCategory(category.id, category.name, isEnabled);
      setNotice(isEnabled ? "Category restored." : "Category archived.");
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not update the category."
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(order: OrderRecord, status: string) {
    setBusy(true);
    try {
      await updateOrder(order.id, status);
      setNotice(`Order ${order.orderReference} updated.`);
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Could not update the order."
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot) return;
    setBusy(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    const zones = String(form.get("deliveryZones") || "")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [name = "", amount = ""] = line.split("|");
        const previous = snapshot.settings.deliveryZones.find(
          zone => zone.name.trim().toLowerCase() === name.trim().toLowerCase()
        );
        return {
          id: previous?.id ?? crypto.randomUUID(),
          name: name.trim(),
          feeAmount: Number(amount.trim()),
        };
      });
    const value: PublicSettings = {
      ...snapshot.settings,
      currencyCode:
        String(form.get("currencyCode") || "")
          .trim()
          .toUpperCase() || null,
      checkoutEnabled: form.get("checkoutEnabled") === "on",
      pickupEnabled: form.get("pickupEnabled") === "on",
      deliveryEnabled: form.get("deliveryEnabled") === "on",
      minimumLeadDays:
        form.get("minimumLeadDays") === ""
          ? null
          : Number(form.get("minimumLeadDays")),
      preorderDays: form.getAll("preorderDay").map(Number),
      operatingHours: String(form.get("operatingHours") || "").trim(),
      currentPolicies: String(form.get("currentPolicies") || "").trim(),
      settingsConfirmed: form.get("settingsConfirmed") === "on",
      pickupDetails: String(form.get("pickupDetails") || "").trim(),
      deliveryZones: zones,
    };
    try {
      await updateSettings(value);
      setNotice("Business settings saved.");
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not save business settings."
      );
    } finally {
      setBusy(false);
    }
  }
  async function changeSlotStatus(slot: AvailabilitySlot) {
    setBusy(true);
    setNotice("");
    try {
      await updateSlot(slot.id, !slot.isOpen);
      setNotice(`Slot ${slot.isOpen ? "closed" : "reopened"}.`);
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Could not update the slot."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveSlot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await addSlot({
        serviceDate: slotDate,
        startTime: slotStart,
        endTime: slotEnd,
        capacity: Number(slotCapacity),
        fulfillment: slotFulfillment,
      });
      setNotice("Availability added.");
      setSlotDate("");
      setSlotStart("");
      setSlotEnd("");
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Could not add availability."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!checked)
    return (
      <main className="admin-loading">
        <span className="loader-dot" /> Checking owner access…
      </main>
    );
  if (!authenticated)
    return (
      <main className="admin-login-page">
        <section className="admin-login-card">
          <Brand />
          <div className="login-heading">
            <span className="admin-shield">
              <ShieldCheck size={21} />
            </span>
            <p className="eyebrow">PRIVATE OWNER ACCESS</p>
            <h1>Good to see you.</h1>
            <p>Sign in to update the menu and manage preorder requests.</p>
          </div>
          <form className="admin-login-form" onSubmit={handleLogin}>
            <label className="form-field">
              <span>Admin email</span>
              <input
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
            </label>
            {loginError && (
              <p className="form-error" role="alert">
                {loginError}
              </p>
            )}
            <button
              className="button button--primary button--wide"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign in securely"}
            </button>
          </form>
          <p className="login-footnote">
            <ShieldCheck size={15} /> Protected owner dashboard. Credentials are
            configured by the site owner.
          </p>
        </section>
        <a className="back-to-store" href="https://linktr.ee/yourfoodiefriend">
          <ArrowLeft size={15} /> Your Foodie Friend
        </a>
      </main>
    );

  const products = snapshot?.products ?? [];
  const orders = snapshot?.orders ?? [];
  const settings = snapshot?.settings;
  const needsReview = products.filter(
    product =>
      product.reviewStatus !== "confirmed" ||
      !product.priceAmount ||
      !product.currencyCode
  ).length;
  const openOrders = orders.filter(
    order => !["completed", "rejected", "cancelled"].includes(order.status)
  ).length;
  const blankProduct: MenuProduct = {
    id: `draft-${crypto.randomUUID()}`,
    name: "",
    category: "Meals",
    description: "",
    sourcePriceText: "",
    priceAmount: null,
    currencyCode: settings?.currencyCode ?? null,
    imageUrl: null,
    reviewStatus: "needs_review",
    published: false,
    available: false,
  };

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar${mobileNav ? " is-open" : ""}`}>
        <Brand />
        <div className="admin-sidebar__label">MANAGE YOUR BUSINESS</div>
        <nav className="admin-nav" aria-label="Admin sections">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={section === id ? "is-active" : ""}
              onClick={() => {
                setSection(id);
                setMobileNav(false);
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === "orders" && openOrders > 0 && <small>{openOrders}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="user-dot">Y</span>
            <span>
              Business owner<small>Private access</small>
            </span>
          </div>
          <button className="signout-button" onClick={handleLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-mobile-menu"
            onClick={() => setMobileNav(value => !value)}
            aria-label="Toggle navigation"
          >
            {mobileNav ? <X size={20} /> : <MenuIcon size={20} />}
          </button>
          <div className="admin-breadcrumb">
            <span>Owner dashboard</span>
            <span aria-hidden="true">/</span>
            <strong>{NAV.find(item => item.id === section)?.label}</strong>
          </div>
          <div className="admin-topbar__right">
            <span
              className={`store-state${settings?.checkoutEnabled ? " store-state--open" : ""}`}
            >
              <i />
              {settings?.checkoutEnabled
                ? "Storefront open"
                : "Ordering closed"}
            </span>
            <a
              href={import.meta.env.VITE_STOREFRONT_ORIGIN || "/"}
              target="_blank"
              rel="noreferrer"
              className="view-store"
            >
              View storefront <ArrowLeft size={14} />
            </a>
          </div>
        </header>
        <main className="admin-content">
          <div className="admin-page-heading">
            <div>
              <p className="eyebrow">YOUR FOODIE FRIEND · PORT HARCOURT</p>
              <h1>
                {section === "overview"
                  ? "A clear view of the kitchen."
                  : NAV.find(item => item.id === section)?.label}
              </h1>
              <p className="admin-subtitle">
                {section === "overview"
                  ? "Your menu, schedule and order requests in one place."
                  : section === "menu"
                    ? "Review each source item and set its current price before publishing."
                    : section === "availability"
                      ? "Choose the dates and times customers can request."
                      : section === "orders"
                        ? "Requests remain unconfirmed until you accept them."
                        : "Keep public business information accurate and up to date."}
              </p>
            </div>
            {section === "menu" && (
              <button
                className="button button--primary"
                onClick={() => {
                  setEditProduct(blankProduct);
                  setIsNew(true);
                }}
              >
                <Plus size={16} /> Add menu item
              </button>
            )}
          </div>
          {notice && (
            <div className="admin-notice" role="status">
              <Check size={16} />
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss message"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {error && (
            <div className="admin-error" role="alert">
              <CircleAlert size={17} />
              <span>
                {error}. Make sure the Netlify API and database are initialized,
                then refresh.
              </span>
              <button onClick={() => void refresh()}>Try again</button>
            </div>
          )}

          {section === "overview" && (
            <>
              <div className="admin-stats">
                <article>
                  <span>Menu items to review</span>
                  <strong>{needsReview}</strong>
                  <small>Source prices are drafts</small>
                </article>
                <article>
                  <span>Open order requests</span>
                  <strong>{openOrders}</strong>
                  <small>Awaiting your review</small>
                </article>
                <article>
                  <span>Next preorder slot</span>
                  <strong className="stat-text">
                    {snapshot?.slots[0]
                      ? dateLabel(snapshot.slots[0].serviceDate)
                      : "Not scheduled"}
                  </strong>
                  <small>Only confirmed slots appear</small>
                </article>
                <article>
                  <span>Storefront status</span>
                  <strong className="stat-text">
                    {settings?.checkoutEnabled ? "Open" : "Closed"}
                  </strong>
                  <small>Ordering opens after review</small>
                </article>
              </div>
              <section className="admin-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Before opening online orders</h2>
                    <p>Confirm current menu and operation details first.</p>
                  </div>
                  <span className="review-badge">
                    <CircleAlert size={14} /> Review required
                  </span>
                </div>
                <div className="readiness-list">
                  {[
                    {
                      label: "Confirm current menu prices and currency",
                      done: needsReview === 0 && products.length > 0,
                      target: "menu" as Section,
                    },
                    {
                      label: "Set available preorder dates and times",
                      done: Boolean(snapshot?.slots.length),
                      target: "availability" as Section,
                    },
                    {
                      label: "Choose pickup or delivery and confirm details",
                      done: Boolean(
                        settings?.pickupEnabled || settings?.deliveryEnabled
                      ),
                      target: "settings" as Section,
                    },
                    {
                      label: "Confirm current policies and operating hours",
                      done: Boolean(settings?.settingsConfirmed),
                      target: "settings" as Section,
                    },
                  ].map(item => (
                    <div key={item.label} className="readiness-row">
                      <span
                        className={`readiness-check${item.done ? " is-done" : ""}`}
                      >
                        {item.done && <Check size={13} />}
                      </span>
                      <span>{item.label}</span>
                      <button onClick={() => setSection(item.target)}>
                        Review <ArrowLeft size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section className="admin-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent requests</h2>
                    <p>Latest saved customer requests.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setSection("orders")}
                  >
                    View all <ArrowLeft size={14} />
                  </button>
                </div>
                {orders.length ? (
                  <OrdersTable
                    orders={orders.slice(0, 5)}
                    onStatus={changeStatus}
                    busy={busy}
                  />
                ) : (
                  <div className="table-empty">
                    <ShoppingBag size={22} />
                    <p>No saved order requests yet.</p>
                  </div>
                )}
              </section>
            </>
          )}

          {section === "menu" && (
            <section className="admin-panel">
              <div className="panel-heading">
                <div>
                  <h2>Menu items</h2>
                  <p>
                    Source amounts are from the supplied menu PDF dated 30 June
                    2026. Verify current prices before publishing.
                  </p>
                </div>
                <span className="review-badge">{needsReview} need review</span>
              </div>
              <CategoryManager
                categories={snapshot?.categories ?? []}
                busy={busy}
                onSave={saveCategory}
                onToggle={toggleCategory}
              />
              {products.length ? (
                <div className="draft-list">
                  {products.map(product => (
                    <article className="draft-row" key={product.id}>
                      <div className="draft-row__main">
                        <span
                          className={`draft-status${product.published ? " draft-status--live" : ""}`}
                        >
                          <i />
                          {product.published
                            ? "Published"
                            : "Draft · needs review"}
                        </span>
                        <strong>{product.name}</strong>
                        <span>
                          {product.category}{" "}
                          <span className="draft-divider">·</span> Source
                          amount: {product.sourcePriceText || "not provided"}
                        </span>
                      </div>
                      <div className="draft-row__price">
                        {product.priceAmount && product.currencyCode ? (
                          <strong>
                            {formatMoney(
                              product.priceAmount,
                              product.currencyCode
                            )}
                          </strong>
                        ) : (
                          <span>Price not confirmed</span>
                        )}
                        <button
                          className="button button--outline button--small"
                          onClick={() => {
                            setEditProduct(product);
                            setIsNew(false);
                          }}
                        >
                          Edit &amp; review
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="table-empty">
                  <Package size={22} />
                  <p>No menu items yet.</p>
                </div>
              )}
            </section>
          )}

          {section === "availability" && (
            <>
              <section className="admin-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Open a preorder slot</h2>
                    <p>Only slots added here can be chosen by customers.</p>
                  </div>
                  <CalendarDays size={21} />
                </div>
                <form className="slot-form" onSubmit={saveSlot}>
                  <label className="form-field">
                    <span>Date</span>
                    <input
                      type="date"
                      required
                      min={todayInPortHarcourt()}
                      value={slotDate}
                      onChange={event => setSlotDate(event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>Start time</span>
                    <input
                      type="time"
                      required
                      value={slotStart}
                      onChange={event => setSlotStart(event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>End time</span>
                    <input
                      type="time"
                      required
                      value={slotEnd}
                      onChange={event => setSlotEnd(event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>Capacity</span>
                    <input
                      type="number"
                      min="1"
                      max="200"
                      required
                      value={slotCapacity}
                      onChange={event => setSlotCapacity(event.target.value)}
                    />
                  </label>
                  <label className="form-field">
                    <span>Fulfillment</span>
                    <select
                      required
                      value={slotFulfillment}
                      onChange={event => setSlotFulfillment(event.target.value)}
                    >
                      <option value="">Choose a confirmed option</option>
                      <option value="pickup">Pickup</option>
                      <option value="delivery">Delivery</option>
                      <option value="both">Pickup &amp; delivery</option>
                    </select>
                  </label>
                  <button className="button button--primary" disabled={busy}>
                    <Plus size={15} /> Add slot
                  </button>
                </form>
              </section>
              <section className="admin-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Scheduled availability</h2>
                    <p>
                      Closed and full slots are not offered on the storefront.
                    </p>
                  </div>
                </div>
                {snapshot?.slots.length ? (
                  <div className="slot-list">
                    {snapshot.slots.map(slot => (
                      <article key={slot.id}>
                        <span className="slot-calendar-icon">
                          <CalendarDays size={18} />
                        </span>
                        <div>
                          <strong>{dateLabel(slot.serviceDate)}</strong>
                          <span>
                            {slot.startTime.slice(0, 5)}–
                            {slot.endTime.slice(0, 5)} · {slot.fulfillment}
                          </span>
                        </div>
                        <span className="slot-capacity">
                          {slot.remainingCapacity} left
                        </span>
                        <span className="slot-tag">
                          {slot.isOpen ? "Open" : "Closed"}
                        </span>
                        <button
                          className="text-button"
                          disabled={busy}
                          aria-label={`${slot.isOpen ? "Close" : "Reopen"} slot for ${dateLabel(slot.serviceDate)}`}
                          onClick={() => void changeSlotStatus(slot)}
                        >
                          {slot.isOpen ? "Close" : "Reopen"}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="table-empty">
                    <CalendarDays size={22} />
                    <p>No preorder slots set up yet.</p>
                  </div>
                )}
              </section>
            </>
          )}

          {section === "orders" && (
            <section className="admin-panel">
              <div className="panel-heading">
                <div>
                  <h2>Order requests</h2>
                  <p>
                    Review the request, then choose a status. Acceptance is the
                    business confirmation.
                  </p>
                </div>
              </div>
              {orders.length ? (
                <OrdersTable
                  orders={orders}
                  onStatus={changeStatus}
                  busy={busy}
                />
              ) : (
                <div className="table-empty">
                  <ShoppingBag size={22} />
                  <p>No saved order requests yet.</p>
                </div>
              )}
            </section>
          )}

          {section === "settings" && settings && (
            <section className="admin-panel">
              <div className="panel-heading">
                <div>
                  <h2>Public storefront settings</h2>
                  <p>
                    Unconfirmed details stay private and checkout remains
                    closed.
                  </p>
                </div>
              </div>
              <form
                className="settings-form"
                key={JSON.stringify(settings)}
                onSubmit={saveSettings}
              >
                <div className="settings-grid">
                  <label className="form-field">
                    <span>Currency code</span>
                    <input
                      name="currencyCode"
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      pattern="[A-Za-z]{3}"
                      maxLength={3}
                      defaultValue={settings.currencyCode ?? ""}
                      placeholder="Enter a confirmed code"
                    />
                    <small>Enter only the verified three-letter code.</small>
                  </label>
                  <label className="form-field">
                    <span>Minimum lead time (days)</span>
                    <input
                      name="minimumLeadDays"
                      type="number"
                      min="0"
                      max="90"
                      defaultValue={settings.minimumLeadDays ?? ""}
                      placeholder="Set only if verified"
                    />
                  </label>
                  <label className="form-field settings-wide">
                    <span>Current operating hours</span>
                    <textarea
                      name="operatingHours"
                      rows={3}
                      defaultValue={settings.operatingHours}
                      placeholder="Enter confirmed hours; leave blank until verified"
                    />
                  </label>
                  <label className="form-field settings-wide">
                    <span>Current policies</span>
                    <textarea
                      name="currentPolicies"
                      rows={5}
                      defaultValue={settings.currentPolicies}
                      placeholder="Enter current policies only after verification"
                    />
                  </label>
                  <label className="form-field settings-wide">
                    <span>Pickup details or address</span>
                    <textarea
                      name="pickupDetails"
                      rows={2}
                      defaultValue={settings.pickupDetails}
                      placeholder="Enter confirmed pickup information, or leave blank"
                    />
                  </label>
                  <label className="form-field settings-wide">
                    <span>
                      Delivery areas and fees{" "}
                      <small>One per line: Area name | fee amount</small>
                    </span>
                    <textarea
                      name="deliveryZones"
                      rows={3}
                      defaultValue={settings.deliveryZones
                        .map(zone => `${zone.name} | ${zone.feeAmount}`)
                        .join("\n")}
                      placeholder="Enter confirmed zones and fees"
                    />
                  </label>
                </div>
                <fieldset className="settings-days">
                  <legend>Preorder days</legend>
                  {DAYS.map((day, index) => (
                    <label key={day}>
                      <input
                        name="preorderDay"
                        type="checkbox"
                        value={index}
                        defaultChecked={settings.preorderDays.includes(index)}
                      />
                      <span>{day}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="settings-toggles">
                  <label>
                    <input
                      type="checkbox"
                      name="pickupEnabled"
                      defaultChecked={settings.pickupEnabled}
                    />
                    <span>
                      <strong>Enable pickup</strong>
                      <small>
                        Only enable once pickup details are confirmed.
                      </small>
                    </span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="deliveryEnabled"
                      defaultChecked={settings.deliveryEnabled}
                    />
                    <span>
                      <strong>Enable delivery</strong>
                      <small>
                        Requires at least one confirmed delivery zone and fee.
                      </small>
                    </span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="settingsConfirmed"
                      defaultChecked={settings.settingsConfirmed}
                    />
                    <span>
                      <strong>
                        I have reviewed the schedule, fulfillment, hours, and
                        current policies
                      </strong>
                      <small>Required before online ordering can open.</small>
                    </span>
                  </label>
                  <label className="danger-toggle">
                    <input
                      type="checkbox"
                      name="checkoutEnabled"
                      defaultChecked={settings.checkoutEnabled}
                    />
                    <span>
                      <strong>Open customer ordering</strong>
                      <small>
                        Server-side checks also require a verified product and
                        available time slot.
                      </small>
                    </span>
                  </label>
                </div>
                <div className="settings-submit">
                  <button className="button button--primary" disabled={busy}>
                    <Save size={16} /> Save settings
                  </button>
                </div>
              </form>
            </section>
          )}
        </main>
      </div>
      {editProduct && (
        <ProductEditor
          product={editProduct}
          isNew={isNew}
          currency={settings?.currencyCode ?? null}
          categories={snapshot?.categories ?? []}
          busy={busy}
          onClose={() => {
            setEditProduct(null);
            setIsNew(false);
          }}
          onSave={saveProduct}
        />
      )}
    </div>
  );
}

function OrdersTable({
  orders,
  onStatus,
  busy,
}: {
  orders: OrderRecord[];
  onStatus: (order: OrderRecord, status: string) => void;
  busy: boolean;
}) {
  const [search, setSearch] = useState("");
  const states = [
    "awaiting_whatsapp",
    "pending_business_acceptance",
    "accepted",
    "rejected",
    "preparing",
    "dispatched",
    "completed",
    "cancelled",
  ];
  const filtered = orders.filter(order =>
    `${order.orderReference} ${order.customerName} ${order.customerPhone} ${order.status} ${order.fulfillment} ${order.items.map(item => item.name).join(" ")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );
  return (
    <>
      <label className="search-box order-search">
        <Search size={17} />
        <span className="sr-only">Search order requests</span>
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search by reference, customer, phone or item"
        />
      </label>
      {filtered.length ? (
        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Placed</th>
                <th>Customer</th>
                <th>Fulfillment</th>
                <th>Total</th>
                <th>Status</th>
                <th>Update</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.orderReference}</strong>
                    <small>
                      {order.items
                        .map(item => `${item.name} ×${item.quantity}`)
                        .join(", ")}
                    </small>
                    {(order.deliveryAddress || order.notes) && (
                      <small>
                        {[
                          order.deliveryAddress,
                          order.notes ? `Note: ${order.notes}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    )}
                  </td>
                  <td>
                    {new Date(order.createdAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td>
                    <strong>{order.customerName}</strong>
                    <a href={`tel:${order.customerPhone}`}>
                      {order.customerPhone}
                    </a>
                  </td>
                  <td>
                    {order.fulfillment}
                    <small>
                      {dateLabel(order.serviceDate)} ·{" "}
                      {order.startTime.slice(0, 5)}
                    </small>
                  </td>
                  <td>{formatMoney(order.totalAmount, order.currencyCode)}</td>
                  <td>
                    <span
                      className={`order-status order-status--${order.status}`}
                    >
                      {words(order.status)}
                    </span>
                  </td>
                  <td>
                    <select
                      aria-label={`Update ${order.orderReference} status`}
                      value={order.status}
                      disabled={busy}
                      onChange={event => onStatus(order, event.target.value)}
                    >
                      {states.map(status => (
                        <option key={status} value={status}>
                          {words(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-empty">
          <ShoppingBag size={20} />
          <p>
            {orders.length
              ? "No order requests match this search."
              : "No saved order requests yet."}
          </p>
        </div>
      )}
    </>
  );
}

function ProductEditor({
  product,
  isNew,
  currency,
  categories,
  busy,
  onClose,
  onSave,
}: {
  product: MenuProduct;
  isNew: boolean;
  currency: string | null;
  categories: AdminCategory[];
  busy: boolean;
  onClose: () => void;
  onSave: (product: MenuProduct) => void;
}) {
  useEffect(
    () =>
      trapDialog(
        document.querySelector<HTMLElement>(
          '[role="dialog"][aria-modal="true"]'
        ),
        onClose
      ),
    [onClose]
  );
  const [draft, setDraft] = useState<MenuProduct>({
    ...product,
    currencyCode: product.currencyCode ?? currency,
  });
  const [confirmed, setConfirmed] = useState(
    product.reviewStatus === "confirmed"
  );
  function update<K extends keyof MenuProduct>(key: K, value: MenuProduct[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      ...draft,
      reviewStatus: confirmed ? "confirmed" : "needs_review",
      published: confirmed && draft.published,
      available: confirmed && draft.available,
    });
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal-card product-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-editor-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">MENU MANAGEMENT</p>
            <h2 id="product-editor-title">
              {isNew ? "Add menu item" : "Review menu item"}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close editor"
          >
            <X size={19} />
          </button>
        </div>
        {!isNew && (
          <div className="source-price-note">
            <CircleAlert size={16} />
            <span>
              Source amount:{" "}
              <strong>{draft.sourcePriceText || "not provided"}</strong>.
              Confirm today’s price and currency below.
            </span>
          </div>
        )}
        <form className="product-form" onSubmit={submit}>
          <label className="form-field">
            <span>Menu item name</span>
            <input
              required
              maxLength={120}
              value={draft.name}
              onChange={event => update("name", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Category</span>
            <input
              list="menu-categories"
              maxLength={60}
              required
              value={draft.category}
              onChange={event => update("category", event.target.value)}
            />
            <datalist id="menu-categories">
              {categories
                .filter(category => category.isEnabled)
                .map(category => (
                  <option key={category.id} value={category.name} />
                ))}
            </datalist>
          </label>
          <div className="form-columns">
            <label className="form-field">
              <span>Current price (whole units)</span>
              <input
                type="number"
                min="1"
                max="100000000"
                step="1"
                required
                value={draft.priceAmount ?? ""}
                onChange={event =>
                  update(
                    "priceAmount",
                    event.target.value === ""
                      ? null
                      : Number(event.target.value)
                  )
                }
                placeholder="Enter confirmed price"
              />
            </label>
            <label className="form-field">
              <span>Currency</span>
              <input
                required
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                value={draft.currencyCode ?? ""}
                onChange={event =>
                  update(
                    "currencyCode",
                    event.target.value.trim().toUpperCase() || null
                  )
                }
                placeholder="Verified three-letter code"
              />
            </label>
          </div>
          <label className="form-field">
            <span>
              Description <small>Owner-confirmed details only</small>
            </span>
            <textarea
              rows={3}
              maxLength={700}
              value={draft.description ?? ""}
              onChange={event => update("description", event.target.value)}
            />
          </label>
          <label className="form-field">
            <span>
              Photo URL <small>Optional</small>
            </span>
            <input
              type="url"
              maxLength={1000}
              value={draft.imageUrl ?? ""}
              onChange={event => update("imageUrl", event.target.value || null)}
              placeholder="https://…"
            />
          </label>
          <label className="editor-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
            />
            <span>
              I confirm the current name, price, currency, and availability
              details.
            </span>
          </label>
          <div className="editor-publish">
            <label>
              <input
                type="checkbox"
                checked={draft.published}
                disabled={!confirmed}
                onChange={event => update("published", event.target.checked)}
              />
              <span>Publish on storefront</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.available}
                disabled={!confirmed}
                onChange={event => update("available", event.target.checked)}
              />
              <span>Available to order</span>
            </label>
          </div>
          <button
            className="button button--primary button--wide"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save menu item"} <Check size={16} />
          </button>
        </form>
      </section>
    </div>
  );
}
