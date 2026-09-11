/**
 * Aurora — an AI-first assistant. The router's entry point; the shell it renders
 * lives in routes/RootLayout.tsx and the route table in routes.tsx.
 */
import { useMemo } from "react";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "./routes";

function App() {
  // Per mount, not at module scope: a browser router resolves window.location when
  // it initializes, so a module-scope instance would stay pinned to whichever URL
  // was current when this module was first imported — fine in the browser, wrong
  // across several tests in one file.
  const router = useMemo(() => createBrowserRouter(routes), []);
  return <RouterProvider router={router} />;
}

export default App;
