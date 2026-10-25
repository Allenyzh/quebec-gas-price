import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE =
  'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]';

/** Activate one modal and return a cleanup that restores the page and its focus. */
export function activateModal(dialog: HTMLElement, onClose: () => void) {
  const returnFocus = document.activeElement;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const body = document.body;
  const properties = ["overflow", "position", "top", "left", "width"];
  const previousStyles = properties.map((property) => ({
    property,
    value: body.style.getPropertyValue(property),
    priority: body.style.getPropertyPriority(property),
  }));
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = `-${scrollX}px`;
  body.style.width = "100%";

  // Each ancestor's siblings are outside the modal, including the app behind it.
  const background = new Map<HTMLElement, boolean>();
  let branch: HTMLElement | null = dialog;
  while (branch && branch !== body) {
    const parent: HTMLElement | null = branch.parentElement;
    for (const sibling of Array.from(parent?.children ?? [])) {
      if (sibling instanceof HTMLElement && sibling !== branch) {
        background.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
    branch = parent;
  }

  const focusables = () =>
    Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.hasAttribute("disabled") &&
        !element.closest("[inert]") &&
        element.getClientRects().length > 0,
    );
  const focusFirst = () => (focusables()[0] ?? dialog).focus({ preventScroll: true });
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = focusables();
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
      event.preventDefault();
      first.focus();
    }
  };
  const handleFocusIn = (event: FocusEvent) => {
    if (!dialog.contains(event.target as Node)) focusFirst();
  };
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("focusin", handleFocusIn, true);
  focusFirst();

  return () => {
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("focusin", handleFocusIn, true);
    background.forEach((inert, element) => { element.inert = inert; });
    previousStyles.forEach(({ property, value, priority }) => {
      if (value) body.style.setProperty(property, value, priority);
      else body.style.removeProperty(property);
    });
    window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
  };
}

export function useModalFocus(
  dialogRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    return activateModal(dialogRef.current, () => onCloseRef.current());
  }, [dialogRef, open]);
}
