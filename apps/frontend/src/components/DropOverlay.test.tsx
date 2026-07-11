import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { DropOverlay } from "./DropOverlay";

test("renders nothing when not visible", () => {
  const { container } = render(<DropOverlay visible={false} />);
  expect(container).toBeEmptyDOMElement();
});

test("shows the drop hint when visible", () => {
  render(<DropOverlay visible={true} />);
  expect(screen.getByText("Drop files to attach")).toBeInTheDocument();
});
