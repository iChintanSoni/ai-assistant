/**
 * The shared <main> for every top-level route: the one focal pane beside the rail.
 *
 * Focusable (`tabIndex={-1}`) so useFocusOnRouteChange can move focus into it on
 * navigation; the outline is suppressed because this is a container, not a control
 * — the design system's visible-focus rule is about things you can actually act on.
 */
import type { ComponentProps } from "react";

export function PageMain({ children, ...rest }: ComponentProps<"main">) {
  return (
    <main
      tabIndex={-1}
      className="relative z-10 flex flex-1 flex-col overflow-hidden px-6 focus:outline-hidden"
      {...rest}
    >
      {children}
    </main>
  );
}
