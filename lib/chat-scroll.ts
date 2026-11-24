/** Minimal scrollable surface used by the chat pane and its unit tests. */
export type Scrollable = {
  scrollHeight: number;
  scrollTop: number;
};

/**
 * Scroll a pane so its latest content is visible.
 * Returns false when there is no element (negative path), so callers can skip.
 */
export function scrollElementToLatest(element: Scrollable | null | undefined): boolean {
  if (!element) return false;
  element.scrollTop = element.scrollHeight;
  return true;
}

export function isScrolledToLatest(
  element: Scrollable & { clientHeight: number },
  tolerance = 1,
): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - tolerance;
}
