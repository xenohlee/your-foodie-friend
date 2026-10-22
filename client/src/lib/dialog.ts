const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function trapDialog(
  dialog: HTMLElement | null,
  onClose: () => void
): () => void {
  if (!dialog) return () => undefined;
  const root: HTMLElement = dialog;
  const previous =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const focusable = () =>
    Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      element =>
        element.getAttribute("aria-hidden") !== "true" &&
        element.offsetParent !== null
    );
  focusable()[0]?.focus();
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusable();
    if (!items.length) {
      event.preventDefault();
      root.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !root.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !root.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  document.addEventListener("keydown", onKeyDown);
  return () => {
    document.removeEventListener("keydown", onKeyDown);
    previous?.focus();
  };
}
