/**
 * Whether the primary pointing device is imprecise — i.e. a touchscreen.
 *
 * The CSS side of this is the `pointer-coarse:` variant; this is for the handful
 * of decisions that can't be expressed in CSS: whether Enter should send (a soft
 * keyboard has no Shift+Enter to make a newline with) and whether opening a panel
 * should focus an input (which would summon the keyboard over it).
 *
 * Note it describes the *pointing* device, not the keyboard — an external keyboard
 * paired with a tablet still reports coarse.
 */
export function isCoarsePointer(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}
