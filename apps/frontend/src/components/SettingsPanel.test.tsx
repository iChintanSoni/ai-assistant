import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useRef } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { useThemeStore } from "../store/theme";
import { SettingsPanel } from "./SettingsPanel";

beforeEach(() => {
  useThemeStore.setState({ preference: "auto", resolved: "light" });
});

test("renders nothing when closed", () => {
  const ref = createRef<HTMLButtonElement>();
  const { container } = render(<SettingsPanel open={false} onClose={vi.fn()} triggerRef={ref} />);
  expect(container).toBeEmptyDOMElement();
});

test("shows the appearance radiogroup reflecting the current preference", () => {
  const ref = createRef<HTMLButtonElement>();
  render(<SettingsPanel open={true} onClose={vi.fn()} triggerRef={ref} />);
  expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
});

test("clicking an appearance option updates the theme store", async () => {
  const ref = createRef<HTMLButtonElement>();
  const user = userEvent.setup();
  render(<SettingsPanel open={true} onClose={vi.fn()} triggerRef={ref} />);

  await user.click(screen.getByRole("radio", { name: "Dark" }));

  expect(useThemeStore.getState().preference).toBe("dark");
});

test("Escape calls onClose", async () => {
  const ref = createRef<HTMLButtonElement>();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<SettingsPanel open={true} onClose={onClose} triggerRef={ref} />);

  await user.keyboard("{Escape}");

  expect(onClose).toHaveBeenCalled();
});

test("the close button calls onClose", async () => {
  const ref = createRef<HTMLButtonElement>();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<SettingsPanel open={true} onClose={onClose} triggerRef={ref} />);

  await user.click(screen.getByRole("button", { name: /close settings/i }));

  expect(onClose).toHaveBeenCalled();
});

test("clicking outside the panel closes it", async () => {
  const ref = createRef<HTMLButtonElement>();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <div>
      <button type="button">outside</button>
      <SettingsPanel open={true} onClose={onClose} triggerRef={ref} />
    </div>,
  );

  await user.click(screen.getByRole("button", { name: "outside" }));

  expect(onClose).toHaveBeenCalled();
});

test("clicking the trigger button itself doesn't trigger the outside-click close", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  function Wrapper() {
    const ref = useRef<HTMLButtonElement>(null);
    return (
      <div>
        <button ref={ref} type="button">
          trigger
        </button>
        <SettingsPanel open={true} onClose={onClose} triggerRef={ref} />
      </div>
    );
  }
  render(<Wrapper />);

  await user.click(screen.getByRole("button", { name: "trigger" }));

  expect(onClose).not.toHaveBeenCalled();
});

test("ArrowRight/ArrowLeft move focus and selection through the appearance options, wrapping around", async () => {
  const ref = createRef<HTMLButtonElement>();
  const user = userEvent.setup();
  render(<SettingsPanel open={true} onClose={vi.fn()} triggerRef={ref} />);

  screen.getByRole("radio", { name: "Auto" }).focus();
  await user.keyboard("{ArrowRight}");
  expect(useThemeStore.getState().preference).toBe("light");
  expect(screen.getByRole("radio", { name: "Light" })).toHaveFocus();

  await user.keyboard("{ArrowLeft}");
  expect(useThemeStore.getState().preference).toBe("auto");

  await user.keyboard("{ArrowLeft}");
  expect(useThemeStore.getState().preference).toBe("dark"); // wraps around to the last option
});
