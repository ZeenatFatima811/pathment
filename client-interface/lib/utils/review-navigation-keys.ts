/**
 * Which way the arrow keys move a reviewer through the queue.
 *
 * Kept apart from the drawer so the rule can be read and tested on its own.
 * There are only two interesting questions, and both are easy to get wrong:
 *
 *   Is this OUR key press?     Any modifier means it belongs to the browser or
 *                              the operating system. The first version of this
 *                              required ALT+arrow, which nobody could discover
 *                              and which collides with Back on Windows and
 *                              Linux — the reviewer either saw nothing happen
 *                              or lost the page they were working on.
 *
 *   Does something else own    Arrows already mean something inside a text box
 *   the arrows right now?      (move the caret) and inside an open menu (move
 *                              the highlighted option). Stealing them there
 *                              would break typing a reason mid-sentence, which
 *                              is worse than having no shortcut at all.
 */

export type ReviewNavigationAction = 'previous' | 'next' | null;

/** The parts of a keyboard event this rule depends on. */
export interface ReviewKeyEvent {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** The parts of an event target this rule depends on. */
export interface ArrowKeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selectors: string) => unknown;
}

/** Elements that already handle arrows, where the shortcut must stand aside. */
const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const MENU_SELECTOR = '[role="listbox"],[role="menu"],[role="combobox"]';

export function targetOwnsArrowKeys(target: ArrowKeyTarget | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (target.tagName && TYPING_TAGS.has(target.tagName.toUpperCase())) return true;
  // An open menu owns the arrows for as long as it is open.
  return typeof target.closest === 'function' ? Boolean(target.closest(MENU_SELECTOR)) : false;
}

export function reviewNavigationAction(
  event: ReviewKeyEvent,
  target?: ArrowKeyTarget | null
): ReviewNavigationAction {
  // Leave every chord to the browser: Alt+Left is Back, Cmd+Left is Back on a
  // Mac, and Shift+Arrow selects text.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (targetOwnsArrowKeys(target)) return null;

  if (event.key === 'ArrowLeft') return 'previous';
  if (event.key === 'ArrowRight') return 'next';
  return null;
}
