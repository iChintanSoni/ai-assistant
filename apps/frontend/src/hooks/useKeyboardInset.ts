/**
 * How much of the viewport the on-screen keyboard is covering, in pixels.
 *
 * `interactive-widget=resizes-content` (in index.html) makes the layout viewport —
 * and therefore `dvh` — shrink with the keyboard, which handles this on Chromium.
 * iOS Safari ignores that hint: it shrinks only the *visual* viewport, so on an
 * `h-dvh overflow-hidden` shell the composer stays behind the keyboard with
 * nothing to scroll. This measures the difference so the shell can pad it out.
 *
 * Returns 0 everywhere the problem doesn't exist — desktop, Chromium, and any
 * browser without `visualViewport`.
 */
import { useEffect, useState } from "react";

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      if (!vv) return;
      // offsetTop accounts for the page being scrolled up to reveal the caret.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Sub-pixel noise and the browser's own toolbar animation both show up here;
      // anything under a few px isn't a keyboard.
      setInset(covered > 24 ? Math.round(covered) : 0);
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}
