import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, newest last. Only the top one reacts to Escape / Tab.
const stack = [];

function getFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null,
  );
}

/**
 * Modal dialog behaviour: moves focus into the dialog on open, keeps Tab
 * inside it, closes on Escape, locks page scroll, and returns focus to
 * whatever was focused before. Attach the returned ref to the dialog panel.
 * `initialFocus` is an optional selector for the element to focus first.
 */
export function useDialog(open, onClose, initialFocus) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const node = ref.current;
    const opener = document.activeElement;
    const id = {};
    stack.push(id);

    if (node && !node.contains(document.activeElement)) {
      const target =
        (initialFocus && node.querySelector(initialFocus)) ||
        getFocusable(node)[0] ||
        node;
      target.focus();
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e) {
      if (!node || stack[stack.length - 1] !== id) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (e.key !== "Tab") return;
      const items = getFocusable(node);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = node.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(id), 1);
      document.body.style.overflow = prevOverflow;
      if (opener && document.contains(opener)) opener.focus?.();
    };
  }, [open, initialFocus]);

  return ref;
}

/**
 * Arrow / Home / End navigation for a list of `role="menuitem*"` or
 * `role="option"` elements inside `container`. Escape and Tab call onClose
 * (Escape passes `true` so the caller can return focus to its trigger).
 */
export function handleMenuKeyDown(e, container, onClose) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    onClose(true);
    return;
  }
  if (e.key === "Tab") {
    onClose(false);
    return;
  }

  const items = container
    ? Array.from(
        container.querySelectorAll('[role^="menuitem"], [role="option"]'),
      )
    : [];
  if (items.length === 0) return;

  const i = items.indexOf(document.activeElement);
  let next = null;
  if (e.key === "ArrowDown") next = items[i < 0 ? 0 : (i + 1) % items.length];
  else if (e.key === "ArrowUp")
    next = items[i <= 0 ? items.length - 1 : i - 1];
  else if (e.key === "Home") next = items[0];
  else if (e.key === "End") next = items[items.length - 1];

  if (next) {
    e.preventDefault();
    next.focus();
  }
}
