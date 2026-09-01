import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * UX review log #9 — real dialog mechanics for every `role="dialog"`
 * popover in the app (the add-to-home-screen prompt, the recovery-link
 * nudge, the QR code popup, the decided-Jio celebration): on open, focus
 * moves to the dialog's primary actionable control rather than staying on
 * the page behind it; while open, Tab/Shift+Tab cycle only among the
 * dialog's own focusable elements, looping first↔last, so focus can never
 * land back on the page behind it; Escape closes from anywhere inside;
 * and on close — however it closes — focus returns to exactly whatever
 * had it before the dialog opened, never dropped to `<body>` or the page
 * top.
 *
 * A generic hook rather than moving every popover to the native
 * `<dialog>` element (which gets points 1–4 for free via `.showModal()`):
 * these popovers range from a full-screen overlay to a backdrop-less
 * bottom snackbar, and re-styling all of them for `<dialog>`'s top-layer
 * rendering risks layout regressions this pass can't fully re-verify
 * visually across every one. The behaviour contract is identical either
 * way — a future pass can still migrate individual components to native
 * `<dialog>` without changing what this hook promises.
 *
 * `containerRef` should point at the element carrying `role="dialog"`
 * itself (also add `aria-modal="true"` there) — every focusable element
 * inside it participates in the trap.
 */
export function useDialogFocus(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void
) {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Ref, not a dependency — Escape should always call whatever `onClose`
  // the latest render passed, without re-running the open/close setup
  // effect (and re-stealing focus) just because the caller's handler
  // identity changed.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const container = containerRef.current;
    container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
