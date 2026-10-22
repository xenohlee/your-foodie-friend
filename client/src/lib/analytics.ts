export type StorefrontEvent =
  | "add_to_cart"
  | "begin_checkout"
  | "menu_filter"
  | "order_request_saved";

/** Integrate a consent-aware analytics provider by listening for `yff:analytics`.
 * Events deliberately contain no customer, contact, address, cart, order, or search data.
 */
export function track(event: StorefrontEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("yff:analytics", { detail: { event } }));
}
