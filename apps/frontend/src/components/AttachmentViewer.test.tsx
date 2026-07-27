import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { canPreviewAttachment } from "../lib/attachmentPreview";
import { AttachmentViewer } from "./AttachmentViewer";

test("recognizes browser-previewable attachment types", () => {
  expect(canPreviewAttachment("image/png")).toBe(true);
  expect(canPreviewAttachment("audio/mpeg")).toBe(true);
  expect(canPreviewAttachment("video/mp4")).toBe(true);
  expect(canPreviewAttachment("text/plain")).toBe(true);
  expect(canPreviewAttachment("application/pdf")).toBe(true);
  expect(canPreviewAttachment("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false);
});

test("shows an image in a modal viewer and closes from the back button", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <AttachmentViewer
      attachment={{ name: "animals.jpg", url: "blob:animals", mimeType: "image/jpeg" }}
      onClose={onClose}
    />,
  );

  expect(screen.getByRole("dialog", { name: "Preview animals.jpg" })).toBeInTheDocument();
  expect(screen.getByAltText("animals.jpg")).toHaveAttribute("src", "blob:animals");
  expect(screen.getByRole("button", { name: "Close attachment preview" })).toHaveFocus();

  await user.click(screen.getByRole("button", { name: "Close attachment preview" }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("Escape closes the viewer", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <AttachmentViewer
      attachment={{ name: "report.pdf", url: "http://files/report.pdf", mimeType: "application/pdf" }}
      onClose={onClose}
    />,
  );

  expect(screen.getByTitle("report.pdf")).toHaveAttribute("src", "http://files/report.pdf");
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});
