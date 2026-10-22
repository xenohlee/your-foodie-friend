import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Leaf,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createOrder, getAvailability, getMenu, formatMoney } from "@/lib/api";
import type {
  AvailabilitySlot,
  FulfillmentMode,
  MenuProduct,
  PublicMenu,
} from "@/lib/types";
import { track } from "@/lib/analytics";
import { trapDialog } from "@/lib/dialog";

type CartLine = { product: MenuProduct; quantity: number };
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
function formatPreorderDays(days: number[]) {
  return days
    .map(day => WEEKDAYS[day])
    .filter(Boolean)
    .join(", ");
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`brand-mark${compact ? " brand-mark--compact" : ""}`}
      aria-hidden="true"
    >
      <UtensilsCrossed size={compact ? 17 : 20} strokeWidth={1.7} />
      <Leaf size={11} className="brand-mark__leaf" />
    </span>
  );
}

function Price({ product }: { product: MenuProduct }) {
  if (!product.priceAmount || !product.currencyCode)
    return <span className="price-pending">Price being confirmed</span>;
  return (
    <span className="price">
      {formatMoney(product.priceAmount, product.currencyCode)}
    </span>
  );
}

export default function Home() {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [menuError, setMenuError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All dishes");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [fulfillment, setFulfillment] = useState<FulfillmentMode | "">("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryZoneId, setDeliveryZoneId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [retryIdentity, setRetryIdentity] = useState<{
    fingerprint: string;
    key: string;
  } | null>(null);

  useEffect(() => {
    if (!selected && !cartOpen && !checkoutOpen) return;
    return trapDialog(
      document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]'),
      () => {
        if (checkoutOpen) setCheckoutOpen(false);
        else if (cartOpen) setCartOpen(false);
        else setSelected(null);
      }
    );
  }, [selected, cartOpen, checkoutOpen]);

  useEffect(() => {
    setLoadingMenu(true);
    const menuRequest = getMenu();
    menuRequest
      .then(setMenu)
      .catch((error: Error) => setMenuError(error.message))
      .finally(() => setLoadingMenu(false));
    try {
      const saved = localStorage.getItem("yff-cart-v1");
      if (saved) {
        const rows: unknown = JSON.parse(saved);
        if (Array.isArray(rows)) {
          void menuRequest
            .then(result => {
              setCart(
                rows.flatMap((row: unknown) => {
                  if (!row || typeof row !== "object") return [];
                  const value = row as { id?: unknown; quantity?: unknown };
                  if (
                    typeof value.id !== "string" ||
                    typeof value.quantity !== "number" ||
                    !Number.isInteger(value.quantity)
                  )
                    return [];
                  const product = result.products.find(
                    item => item.id === value.id && item.available
                  );
                  return product
                    ? [
                        {
                          product,
                          quantity: Math.max(
                            1,
                            Math.min(50, value.quantity as number)
                          ),
                        },
                      ]
                    : [];
                })
              );
            })
            .catch(() => {});
        }
      }
    } catch {
      try {
        localStorage.removeItem("yff-cart-v1");
      } catch {
        /* Storage may be disabled. */
      }
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "yff-cart-v1",
        JSON.stringify(
          cart.map(({ product, quantity }) => ({ id: product.id, quantity }))
        )
      );
    } catch {
      /* Storage may be disabled. */
    }
  }, [cart]);

  useEffect(() => {
    if (!checkoutOpen || !menu?.settings.checkoutEnabled) return;
    setSlotsLoading(true);
    getAvailability()
      .then(items => setSlots(items))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [checkoutOpen, menu?.settings.checkoutEnabled]);

  const categories = useMemo(
    () => ["All dishes", ...(menu?.categories ?? [])],
    [menu]
  );
  const visibleProducts = useMemo(
    () =>
      (menu?.products ?? []).filter(
        product =>
          product.available &&
          (category === "All dishes" || product.category === category) &&
          `${product.name} ${product.category} ${product.description ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())
      ),
    [menu, category, search]
  );
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce(
    (sum, line) => sum + (line.product.priceAmount ?? 0) * line.quantity,
    0
  );
  const selectedZone = menu?.settings.deliveryZones.find(
    zone => zone.id === deliveryZoneId
  );
  const compatibleSlots = slots.filter(
    slot =>
      !fulfillment ||
      slot.fulfillment === "both" ||
      slot.fulfillment === fulfillment
  );
  const deliveryFee =
    fulfillment === "delivery" ? (selectedZone?.feeAmount ?? 0) : 0;
  const total = subtotal + deliveryFee;

  function addToCart(product: MenuProduct, amount = 1) {
    if (!product.available || !product.priceAmount || !product.currencyCode)
      return;
    setCart(current => {
      const existing = current.find(line => line.product.id === product.id);
      return existing
        ? current.map(line =>
            line.product.id === product.id
              ? { ...line, quantity: Math.min(50, line.quantity + amount) }
              : line
          )
        : [...current, { product, quantity: amount }];
    });
    setSelected(null);
    setCartOpen(true);
    track("add_to_cart");
  }
  function chooseFulfillment(value: FulfillmentMode) {
    setFulfillment(value);
    const selected = slots.find(slot => slot.id === selectedSlot);
    if (
      selected &&
      selected.fulfillment !== "both" &&
      selected.fulfillment !== value
    )
      setSelectedSlot("");
  }
  function changeQuantity(id: string, delta: number) {
    setCart(current =>
      current.flatMap(line =>
        line.product.id === id
          ? line.quantity + delta <= 0
            ? []
            : [{ ...line, quantity: Math.min(50, line.quantity + delta) }]
          : [line]
      )
    );
  }
  function beginCheckout() {
    setOrderError("");
    setWhatsappUrl("");
    setOrderReference("");
    setCartOpen(false);
    setCheckoutOpen(true);
    track("begin_checkout");
  }
  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderError("");
    if (!menu?.settings.checkoutEnabled) {
      setOrderError(
        "Online ordering is not open yet. Please message us on WhatsApp to check availability."
      );
      return;
    }
    if (!selectedSlot || !fulfillment) {
      setOrderError("Choose an available date, time, and fulfillment option.");
      return;
    }
    if (
      fulfillment === "delivery" &&
      (!deliveryAddress.trim() || !deliveryZoneId)
    ) {
      setOrderError("Choose a delivery area and enter the delivery address.");
      return;
    }
    setOrderBusy(true);
    const orderFields = {
      items: cart.map(({ product, quantity }) => ({
        productId: product.id,
        quantity,
      })),
      slotId: selectedSlot,
      fulfillment,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress:
        fulfillment === "delivery" ? deliveryAddress.trim() : undefined,
      deliveryZoneId: fulfillment === "delivery" ? deliveryZoneId : undefined,
      notes: orderNotes.trim() || undefined,
    };
    const fingerprint = JSON.stringify(orderFields);
    const idempotencyKey =
      retryIdentity?.fingerprint === fingerprint
        ? retryIdentity.key
        : crypto.randomUUID();
    setRetryIdentity({ fingerprint, key: idempotencyKey });
    try {
      const result = await createOrder({ ...orderFields, idempotencyKey });
      setWhatsappUrl(result.whatsappUrl);
      setOrderReference(result.orderReference);
      setCart([]);
      setRetryIdentity(null);
      track("order_request_saved");
    } catch (error) {
      setOrderError(
        error instanceof Error
          ? error.message
          : "We couldn't save that request. Please try again."
      );
    } finally {
      setOrderBusy(false);
    }
  }

  return (
    <div className="site-shell">
      <div className="announcement">
        <span className="announcement__dot" /> Preorders for Port Harcourt{" "}
        <span className="announcement__divider">·</span> Rivers State
      </div>
      <header className="site-header">
        <a
          className="wordmark"
          href="#top"
          aria-label="Your Foodie Friend home"
        >
          <BrandMark />
          <span>
            Your Foodie Friend<small>PORT HARCOURT · NIGERIA</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#menu">The menu</a>
          <a href="#how-it-works">How to order</a>
          <a href="#about">About</a>
        </nav>
        <button
          className="header-cart"
          onClick={() => setCartOpen(true)}
          aria-label={`Open cart, ${cartCount} items`}
        >
          <ShoppingBag size={18} />
          <span>Bag</span>
          <b>{cartCount}</b>
        </button>
      </header>

      <main id="top">
        <section className="hero container" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-line" /> YOUR PORT HARCOURT FOODIE FRIEND
            </p>
            <h1 id="hero-title">
              Good food.
              <br />
              <em>Worth planning for.</em>
            </h1>
            <p className="hero-lede">
              A little something lovely for your table. Browse the menu, choose
              a day, and send your preorder request when slots are open.
            </p>
            <div className="hero-actions">
              <a className="button button--primary" href="#menu">
                Explore the menu <ArrowRight size={17} />
              </a>
              <a className="text-link" href="#how-it-works">
                How preordering works <ArrowDown size={15} />
              </a>
            </div>
            <div className="hero-notes">
              <span>
                <MapPin size={15} /> Port Harcourt, Rivers State
              </span>
              <span>
                <Clock3 size={15} /> Preorder times shown when confirmed
              </span>
            </div>
          </div>
          <div className="hero-image-wrap">
            <img
              className="hero-image"
              src="/images/foodie-friend-hero.webp"
              alt="Illustrative Nigerian jollof rice with chicken and fried plantain; actual menu presentation may vary"
              fetchPriority="high"
            />
            <span className="photo-note">Illustrative food photography</span>
            <div className="hero-stamp" aria-hidden="true">
              <span>
                GOOD
                <br />
                THINGS
                <br />
                TAKE TIME
              </span>
              <i>✳</i>
            </div>
          </div>
        </section>

        <section
          className="schedule-band"
          aria-label="Preorder schedule status"
        >
          <div className="container schedule-band__inner">
            <div className="schedule-band__icon">
              <Clock3 size={20} />
            </div>
            <div>
              {menu?.settings.settingsConfirmed ? (
                <>
                  <strong>
                    {menu.settings.checkoutEnabled
                      ? "Current preorder schedule"
                      : "Confirmed preorder schedule"}
                  </strong>
                  <p>
                    {formatPreorderDays(menu.settings.preorderDays)} · Hours:{" "}
                    {menu.settings.operatingHours}.{" "}
                    {menu.settings.checkoutEnabled
                      ? "Choose an available date and time when requesting an order."
                      : "Online requests are not open right now; message us to ask about availability."}
                  </p>
                </>
              ) : (
                <>
                  <strong>
                    We’re confirming the current preorder schedule.
                  </strong>
                  <p>
                    The source menu lists Monday, Wednesday, Friday and
                    Saturday. Current availability has not yet been confirmed.
                  </p>
                </>
              )}
            </div>
            <a
              href="https://wa.me/2348137523400"
              target="_blank"
              rel="noreferrer"
              className="schedule-band__link"
            >
              Ask on WhatsApp <ArrowUpRight size={15} />
            </a>
          </div>
        </section>

        <section
          className="menu-section container"
          id="menu"
          aria-labelledby="menu-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-line" /> FROM OUR KITCHEN
              </p>
              <h2 id="menu-title">
                The menu<span className="heading-period">.</span>
              </h2>
              <p className="section-subtitle">
                Browse what’s available. Items and prices appear once the
                current menu has been confirmed.
              </p>
            </div>
            <a
              className="menu-contact"
              href="https://wa.me/2348137523400"
              target="_blank"
              rel="noreferrer"
            >
              Ask about today <ArrowUpRight size={16} />
            </a>
          </div>
          {menu?.products.length ? (
            <>
              <div className="menu-tools">
                <label className="search-box">
                  <Search size={18} />
                  <span className="sr-only">Search the menu</span>
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search the menu"
                  />
                </label>
                <div
                  className="category-list"
                  role="group"
                  aria-label="Filter menu by category"
                >
                  {categories.map(item => (
                    <button
                      key={item}
                      className={`category-chip${category === item ? " is-active" : ""}`}
                      onClick={() => {
                        setCategory(item);
                        track("menu_filter");
                      }}
                      aria-pressed={category === item}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="menu-grid">
                {visibleProducts.map(product => (
                  <article key={product.id} className="menu-card">
                    <button
                      className="menu-card__detail"
                      onClick={() => setSelected(product)}
                      aria-label={`View ${product.name} details`}
                    >
                      <span className="menu-card__image">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="menu-card__placeholder">
                            <UtensilsCrossed size={26} />
                            <small>{product.category}</small>
                          </span>
                        )}
                        <span className="menu-card__arrow">
                          <ArrowUpRight size={17} />
                        </span>
                      </span>
                      <span className="menu-card__category">
                        {product.category}
                      </span>
                      <strong className="menu-card__name">
                        {product.name}
                      </strong>
                      <span className="menu-card__bottom">
                        <Price product={product} />
                        <span className="menu-card__more">Details</span>
                      </span>
                    </button>
                    <button
                      className="menu-card__add"
                      onClick={() => addToCart(product)}
                      aria-label={`Add ${product.name} to bag`}
                    >
                      <Plus size={16} /> Add to bag
                    </button>
                  </article>
                ))}
              </div>
              {!visibleProducts.length && (
                <div className="empty-state">
                  <Search size={24} />
                  <h3>No menu items found</h3>
                  <p>Try another search or choose a different category.</p>
                  <button
                    className="button button--outline"
                    onClick={() => {
                      setSearch("");
                      setCategory("All dishes");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="menu-empty">
              <div className="menu-empty__illustration">
                <UtensilsCrossed size={30} />
                <span>✳</span>
              </div>
              <div className="menu-empty__copy">
                <p className="eyebrow">A LITTLE PATIENCE, PLEASE</p>
                <h3>
                  {loadingMenu
                    ? "Setting the table…"
                    : "Our menu is being refreshed."}
                </h3>
                <p>
                  {menuError
                    ? "Online ordering is temporarily unavailable. You can still ask us about the menu on WhatsApp."
                    : "We’re confirming the latest dishes, prices and preorder times before opening online orders."}
                </p>
                <a
                  className="button button--outline"
                  href="https://wa.me/2348137523400"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ask us on WhatsApp <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
          )}
          {menuError && (
            <p className="inline-error" role="status">
              The menu service could not be reached. Please try again later or
              contact us on WhatsApp.
            </p>
          )}
        </section>

        <section className="how-section" id="how-it-works">
          <div className="container how-section__inner">
            <div className="how-intro">
              <p className="eyebrow">
                <span className="eyebrow-line" /> THE GOOD-TO-KNOW
              </p>
              <h2>
                A little planning
                <br />
                <em>goes a long way.</em>
              </h2>
              <p>
                We prepare by preorder. Choose from the current menu when it’s
                open, tell us when and how you’d like your order, then send your
                request to us on WhatsApp.
              </p>
            </div>
            <div className="steps-list">
              <article className="step">
                <span className="step__number">01</span>
                <div>
                  <h3>Choose what you fancy</h3>
                  <p>Explore the menu and add available items to your bag.</p>
                </div>
              </article>
              <article className="step">
                <span className="step__number">02</span>
                <div>
                  <h3>Pick a date &amp; time</h3>
                  <p>Choose from the preorder slots the kitchen has opened.</p>
                </div>
              </article>
              <article className="step">
                <span className="step__number">03</span>
                <div>
                  <h3>Send your request</h3>
                  <p>
                    Your order is only confirmed when Your Foodie Friend accepts
                    it.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="about-section container" id="about">
          <div className="about-mark">
            <BrandMark compact />
          </div>
          <div>
            <p className="eyebrow">A NOTE FROM YOUR FOODIE FRIEND</p>
            <h2>
              Made to be shared.
              <br />
              <em>Ordered ahead.</em>
            </h2>
            <p>
              We’re a preorder food business serving Port Harcourt.{" "}
              {menu?.settings.settingsConfirmed
                ? "Current ordering information is shown here; message us if you need help with a request."
                : "We’re getting the current menu and order details ready to share. Until then, send us a message and we’ll help you directly."}
            </p>
          </div>
          <a
            className="button button--primary"
            href="https://wa.me/2348137523400"
            target="_blank"
            rel="noreferrer"
          >
            Say hello on WhatsApp <ArrowUpRight size={16} />
          </a>
        </section>
        {menu?.settings.settingsConfirmed && (
          <section
            className="order-details container"
            id="ordering-details"
            aria-labelledby="ordering-details-title"
          >
            <div className="order-details__intro">
              <p className="eyebrow">
                <span className="eyebrow-line" /> THE PRACTICAL DETAILS
              </p>
              <h2 id="ordering-details-title">
                Before you place a request
                <span className="heading-period">.</span>
              </h2>
              <p>These are the current details confirmed by the business.</p>
            </div>
            <div className="order-details__grid">
              <article>
                <h3>Preorder schedule</h3>
                <p>{formatPreorderDays(menu.settings.preorderDays)}</p>
                <p>Hours: {menu.settings.operatingHours}</p>
              </article>
              {menu.settings.pickupEnabled && (
                <article>
                  <h3>Pickup</h3>
                  <p>{menu.settings.pickupDetails}</p>
                </article>
              )}
              {menu.settings.deliveryEnabled && (
                <article>
                  <h3>Delivery areas</h3>
                  <ul>
                    {menu.settings.deliveryZones.map(zone => (
                      <li key={zone.id}>
                        {zone.name}
                        {menu.settings.currencyCode
                          ? ` · ${formatMoney(zone.feeAmount, menu.settings.currencyCode)}`
                          : " · Fee to confirm"}
                      </li>
                    ))}
                  </ul>
                </article>
              )}
              <article className="order-details__policies">
                <h3>Ordering policies</h3>
                <p>{menu.settings.currentPolicies}</p>
              </article>
            </div>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="container site-footer__top">
          <a className="wordmark wordmark--footer" href="#top">
            <BrandMark />
            <span>
              Your Foodie Friend<small>PORT HARCOURT · NIGERIA</small>
            </span>
          </a>
          <div className="footer-links">
            <a href="#menu">Menu</a>
            <a href="#how-it-works">How to order</a>
            {menu?.settings.settingsConfirmed && (
              <a href="#ordering-details">Ordering details</a>
            )}
            <a
              href="https://wa.me/2348137523400"
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </div>
          <span className="footer-city">Port Harcourt, Nigeria</span>
        </div>
        <div className="container site-footer__bottom">
          <span>© {new Date().getFullYear()} Your Foodie Friend</span>
          <span>
            Menu and order details are confirmed directly with the business.
          </span>
          <a
            href="https://linktr.ee/yourfoodiefriend"
            target="_blank"
            rel="noreferrer"
          >
            Linktree <ArrowUpRight size={13} />
          </a>
        </div>
      </footer>

      {cartCount > 0 && (
        <button className="mobile-bag" onClick={() => setCartOpen(true)}>
          <ShoppingBag size={18} /> View bag <span>{cartCount}</span>
          <strong>
            {menu?.settings.currencyCode
              ? formatMoney(subtotal, menu.settings.currencyCode)
              : "Review total"}
          </strong>
        </button>
      )}

      {selected && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            className="modal-card item-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-title"
          >
            <button
              className="icon-button modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close item details"
            >
              <X size={19} />
            </button>
            {selected.imageUrl ? (
              <img
                className="item-modal__image-photo"
                src={selected.imageUrl}
                alt={selected.name}
              />
            ) : (
              <span className="menu-card__placeholder item-modal__image">
                <UtensilsCrossed size={34} />
                <small>{selected.category}</small>
              </span>
            )}
            <p className="eyebrow">{selected.category}</p>
            <h2 id="item-title">{selected.name}</h2>
            {selected.description && <p>{selected.description}</p>}
            <div className="item-modal__price">
              <Price product={selected} />
            </div>
            <button
              className="button button--primary button--wide"
              disabled={
                !selected.available ||
                !selected.priceAmount ||
                !selected.currencyCode
              }
              onClick={() => addToCart(selected)}
            >
              Add to bag <Plus size={16} />
            </button>
          </section>
        </div>
      )}

      {cartOpen && (
        <div
          className="modal-backdrop modal-backdrop--drawer"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setCartOpen(false);
          }}
        >
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">YOUR SELECTION</p>
                <h2 id="cart-title">
                  Your bag <span>{cartCount}</span>
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setCartOpen(false)}
                aria-label="Close bag"
              >
                <X size={20} />
              </button>
            </div>
            {cart.length ? (
              <>
                <div className="cart-lines">
                  {cart.map(({ product, quantity }) => (
                    <div className="cart-line" key={product.id}>
                      <div className="cart-line__details">
                        <strong>{product.name}</strong>
                        <Price product={product} />
                        <div className="quantity-control">
                          <button
                            onClick={() => changeQuantity(product.id, -1)}
                            aria-label={`Remove one ${product.name}`}
                          >
                            <Minus size={13} />
                          </button>
                          <span>{quantity}</span>
                          <button
                            onClick={() => changeQuantity(product.id, 1)}
                            aria-label={`Add one ${product.name}`}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                      <button
                        className="remove-line"
                        onClick={() =>
                          setCart(current =>
                            current.filter(
                              line => line.product.id !== product.id
                            )
                          )
                        }
                        aria-label={`Remove ${product.name}`}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="cart-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>
                      {menu?.settings.currencyCode
                        ? formatMoney(subtotal, menu.settings.currencyCode)
                        : "—"}
                    </strong>
                  </div>
                  <p>
                    Delivery fees, if applicable, are shown after you select a
                    verified delivery area.
                  </p>
                  <button
                    className="button button--primary button--wide"
                    disabled={!menu?.settings.checkoutEnabled}
                    onClick={beginCheckout}
                  >
                    {menu?.settings.checkoutEnabled
                      ? "Choose date & time"
                      : "Ordering is not open yet"}{" "}
                    <ArrowRight size={16} />
                  </button>
                  <small>
                    Your order is not confirmed until the business accepts it.
                  </small>
                </div>
              </>
            ) : (
              <div className="cart-empty">
                <ShoppingBag size={28} />
                <h3>Your bag is waiting</h3>
                <p>When the current menu is open, add a few favourites here.</p>
                <button
                  className="button button--outline"
                  onClick={() => setCartOpen(false)}
                >
                  Keep browsing
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {checkoutOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setCheckoutOpen(false);
          }}
        >
          <section
            className="modal-card checkout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">PREORDER REQUEST</p>
                <h2 id="checkout-title">Your details</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setCheckoutOpen(false)}
                aria-label="Close checkout"
              >
                <X size={20} />
              </button>
            </div>
            {whatsappUrl ? (
              <div className="order-success" role="status">
                <span className="success-mark">
                  <Check size={22} />
                </span>
                <h3>Request {orderReference} is ready</h3>
                <p>
                  It is not confirmed yet. Send the prepared message on
                  WhatsApp, then wait for Your Foodie Friend to accept your
                  order.
                </p>
                <a
                  className="button button--primary button--wide"
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Continue to WhatsApp <ArrowUpRight size={16} />
                </a>
                <button
                  className="text-button"
                  onClick={() => {
                    setCheckoutOpen(false);
                    setSelectedSlot("");
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form className="checkout-form" onSubmit={submitOrder}>
                <p className="form-intro">
                  Choose a confirmed slot and tell us how to get in touch. Your
                  request will be saved before WhatsApp opens.
                </p>
                <label className="form-field">
                  <span>Available date &amp; time</span>
                  <select
                    required
                    value={selectedSlot}
                    onChange={event => setSelectedSlot(event.target.value)}
                    disabled={slotsLoading || !compatibleSlots.length}
                  >
                    <option value="">
                      {slotsLoading
                        ? "Loading available times…"
                        : compatibleSlots.length
                          ? "Choose a slot"
                          : "No confirmed slots available"}
                    </option>
                    {compatibleSlots.map(slot => (
                      <option key={slot.id} value={slot.id}>
                        {new Date(
                          `${slot.serviceDate}T${slot.startTime}:00+01:00`
                        ).toLocaleString("en-NG", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "Africa/Lagos",
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="fulfillment-field">
                  <legend>How would you like your order?</legend>
                  <div className="fulfillment-options">
                    {menu?.settings.pickupEnabled && (
                      <button
                        type="button"
                        className={`fulfillment-option${fulfillment === "pickup" ? " is-selected" : ""}`}
                        onClick={() => chooseFulfillment("pickup")}
                      >
                        <span className="fulfillment-icon">
                          <UtensilsCrossed size={18} />
                        </span>
                        <strong>Pickup</strong>
                      </button>
                    )}
                    {menu?.settings.deliveryEnabled && (
                      <button
                        type="button"
                        className={`fulfillment-option${fulfillment === "delivery" ? " is-selected" : ""}`}
                        onClick={() => chooseFulfillment("delivery")}
                      >
                        <span className="fulfillment-icon">
                          <MapPin size={18} />
                        </span>
                        <strong>Delivery</strong>
                      </button>
                    )}
                  </div>
                  {!menu?.settings.pickupEnabled &&
                    !menu?.settings.deliveryEnabled && (
                      <p className="field-help">
                        Pickup and delivery details are being confirmed by the
                        business.
                      </p>
                    )}
                </fieldset>
                {fulfillment === "pickup" && menu?.settings.pickupDetails && (
                  <div className="fulfillment-confirmation">
                    <strong>Confirmed pickup details</strong>
                    <p>{menu.settings.pickupDetails}</p>
                  </div>
                )}
                {fulfillment === "delivery" && (
                  <>
                    <label className="form-field">
                      <span>Delivery area</span>
                      <select
                        required
                        value={deliveryZoneId}
                        onChange={event =>
                          setDeliveryZoneId(event.target.value)
                        }
                      >
                        <option value="">Choose a confirmed area</option>
                        {menu?.settings.deliveryZones.map(zone => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name} —{" "}
                            {menu.settings.currencyCode
                              ? formatMoney(
                                  zone.feeAmount,
                                  menu.settings.currencyCode
                                )
                              : "Fee to confirm"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      <span>Delivery address</span>
                      <textarea
                        required
                        value={deliveryAddress}
                        onChange={event =>
                          setDeliveryAddress(event.target.value)
                        }
                        rows={2}
                        autoComplete="street-address"
                      />
                    </label>
                  </>
                )}
                <div className="form-columns">
                  <label className="form-field">
                    <span>Your name</span>
                    <input
                      required
                      maxLength={100}
                      value={customerName}
                      onChange={event => setCustomerName(event.target.value)}
                      autoComplete="name"
                    />
                  </label>
                  <label className="form-field">
                    <span>Phone number</span>
                    <input
                      required
                      maxLength={24}
                      value={customerPhone}
                      onChange={event => setCustomerPhone(event.target.value)}
                      autoComplete="tel"
                      inputMode="tel"
                    />
                  </label>
                </div>
                <label className="form-field">
                  <span>
                    Anything else? <small>Optional</small>
                  </span>
                  <textarea
                    maxLength={500}
                    value={orderNotes}
                    onChange={event => setOrderNotes(event.target.value)}
                    rows={2}
                  />
                </label>
                {menu?.settings.currentPolicies && (
                  <details className="policy-disclosure">
                    <summary>Read current ordering policies</summary>
                    <p>{menu.settings.currentPolicies}</p>
                  </details>
                )}
                <label className="consent-check">
                  <input required type="checkbox" />
                  <span>
                    I agree to share these details with Your Foodie Friend to
                    handle this order request.
                  </span>
                </label>
                {orderError && (
                  <p className="form-error" role="alert">
                    {orderError}
                  </p>
                )}
                <div className="checkout-total">
                  <span>Estimated total</span>
                  <strong>
                    {menu?.settings.currencyCode
                      ? formatMoney(total, menu.settings.currencyCode)
                      : "—"}
                  </strong>
                </div>
                <p className="acceptance-note">
                  This is a request, not a confirmed order. Your Foodie Friend
                  must accept it directly. No payment-on-delivery or other
                  payment policy is assumed here.
                </p>
                <button
                  className="button button--primary button--wide"
                  type="submit"
                  disabled={
                    orderBusy || !compatibleSlots.length || !fulfillment
                  }
                >
                  {orderBusy
                    ? "Saving your request…"
                    : "Save request & continue"}{" "}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
