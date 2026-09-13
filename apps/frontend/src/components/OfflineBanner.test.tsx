import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { OfflineBanner } from "./OfflineBanner";

test("renders nothing when online", () => {
  const { container } = render(<OfflineBanner isOnline={true} />);
  expect(container).toBeEmptyDOMElement();
});

test("shows the offline notice when not online", () => {
  render(<OfflineBanner isOnline={false} />);
  expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
});
