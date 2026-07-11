import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useFileDrop } from "./useFileDrop";

function fakeDragEvent(hasFiles: boolean, files: File[] = []): DragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { types: hasFiles ? ["Files"] : ["text/plain"], files },
  } as unknown as DragEvent;
}

let addSpy: ReturnType<typeof vi.spyOn>;
let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  addSpy = vi.spyOn(window, "addEventListener");
  removeSpy = vi.spyOn(window, "removeEventListener");
});

afterEach(() => {
  addSpy.mockRestore();
  removeSpy.mockRestore();
});

test("registers window-level dragover/drop guards on mount and cleans them up on unmount", () => {
  const { unmount } = renderHook(() => useFileDrop(vi.fn()));
  expect(addSpy).toHaveBeenCalledWith("dragover", expect.any(Function));
  expect(addSpy).toHaveBeenCalledWith("drop", expect.any(Function));
  unmount();
  expect(removeSpy).toHaveBeenCalledWith("dragover", expect.any(Function));
  expect(removeSpy).toHaveBeenCalledWith("drop", expect.any(Function));
});

test("dragEnter with files shows the overlay; a non-file drag is ignored", () => {
  const { result } = renderHook(() => useFileDrop(vi.fn()));

  const textEvent = fakeDragEvent(false);
  act(() => result.current.dropZoneProps.onDragEnter(textEvent));
  expect(result.current.isDraggingFiles).toBe(false);
  expect(textEvent.preventDefault).not.toHaveBeenCalled();

  const fileEvent = fakeDragEvent(true);
  act(() => result.current.dropZoneProps.onDragEnter(fileEvent));
  expect(result.current.isDraggingFiles).toBe(true);
  expect(fileEvent.preventDefault).toHaveBeenCalled();
});

test("the overlay only hides once every nested dragEnter has a matching dragLeave", () => {
  const { result } = renderHook(() => useFileDrop(vi.fn()));

  act(() => result.current.dropZoneProps.onDragEnter(fakeDragEvent(true)));
  act(() => result.current.dropZoneProps.onDragEnter(fakeDragEvent(true))); // entered a nested child
  act(() => result.current.dropZoneProps.onDragLeave(fakeDragEvent(true)));
  expect(result.current.isDraggingFiles).toBe(true); // still inside the outer zone

  act(() => result.current.dropZoneProps.onDragLeave(fakeDragEvent(true)));
  expect(result.current.isDraggingFiles).toBe(false);
});

test("dragLeave depth never goes negative", () => {
  const { result } = renderHook(() => useFileDrop(vi.fn()));
  act(() => result.current.dropZoneProps.onDragLeave(fakeDragEvent(true)));
  act(() => result.current.dropZoneProps.onDragEnter(fakeDragEvent(true)));
  expect(result.current.isDraggingFiles).toBe(true);
});

test("drop calls onDropFiles with the dropped files and resets drag state", () => {
  const onDropFiles = vi.fn();
  const { result } = renderHook(() => useFileDrop(onDropFiles));
  act(() => result.current.dropZoneProps.onDragEnter(fakeDragEvent(true)));

  const file = new File(["x"], "a.png", { type: "image/png" });
  const dropEvent = fakeDragEvent(true, [file]);
  act(() => result.current.dropZoneProps.onDrop(dropEvent));

  expect(dropEvent.preventDefault).toHaveBeenCalled();
  expect(onDropFiles).toHaveBeenCalledWith([file]);
  expect(result.current.isDraggingFiles).toBe(false);
});

test("drop with no files does not call onDropFiles", () => {
  const onDropFiles = vi.fn();
  const { result } = renderHook(() => useFileDrop(onDropFiles));
  act(() => result.current.dropZoneProps.onDrop(fakeDragEvent(true, [])));
  expect(onDropFiles).not.toHaveBeenCalled();
});
