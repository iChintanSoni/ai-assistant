/**
 * Which top-level view a path belongs to.
 *
 * `/` and `/c/:id` are both the chat view — that distinction is the point. Focus
 * management and the rail's active state care about *views*, not paths, because a
 * live chat rewrites `/` to `/c/:id` mid-stream and that must not read as moving
 * to a different screen.
 */
export type RouteView = "chat" | "files" | "settings";

export function routeViewFromPath(pathname: string): RouteView {
  if (pathname.startsWith("/files")) return "files";
  if (pathname.startsWith("/settings")) return "settings";
  return "chat";
}
