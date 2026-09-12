/**
 * The shared <main> for every top-level route: the one focal pane beside the rail.
 *
 * Focusable (`tabIndex={-1}`) so useFocusOnRouteChange can move focus into it on
 * navigation. It carries a real focus ring: the design system's rule is that
 * `focus:outline-hidden` is only ever paired with one, and since focus lands here
 * programmatically, a keyboard user has no other way to tell it moved.
 */
import type { ComponentProps } from "react";

export function PageMain({ children, ...rest }: ComponentProps<"main">) {
  return (
    <main
      tabIndex={-1}
      className="relative z-10 flex flex-1 flex-col overflow-hidden px-4 pb-[calc(3.25rem+max(0.5rem,env(safe-area-inset-bottom)))] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 md:px-6 md:pb-0"
      {...rest}
    >
      {children}
    </main>
  );
}
