import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("../hooks/useChat", () => ({ useChat: vi.fn() }));

import { useChat } from "../hooks/useChat";
import { useChatStore, type UITurn } from "../store/chat";
import { formatFullDateTime, formatMessageTime } from "../lib/format";
import { Conversation } from "./Conversation";

function userTurn(overrides: Partial<UITurn> = {}): UITurn {
  return { id: "u1", role: "user", text: "hello", reasoning: "", tools: [], status: "complete", ...overrides };
}
function agentTurn(overrides: Partial<UITurn> = {}): UITurn {
  return { id: "a1", role: "agent", text: "", reasoning: "", tools: [], status: "complete", ...overrides };
}

beforeEach(() => {
  useChatStore.setState({ turns: [] });
  vi.mocked(useChat).mockReturnValue({ send: vi.fn(), respond: vi.fn().mockResolvedValue(undefined), stop: vi.fn() });
  Element.prototype.scrollIntoView = vi.fn();
});

test("renders a user turn's text and attachments (image, chip, legacy string)", () => {
  useChatStore.setState({
    turns: [
      userTurn({
        text: "check this out",
        attachments: [
          { name: "photo.png", url: "http://files/photo.png", mimeType: "image/png", size: 1 },
          { name: "notes.pdf", url: "http://files/notes.pdf", mimeType: "application/pdf", size: 1 },
          "legacy-plain.txt",
        ],
      }),
    ],
  });

  render(<Conversation />);

  expect(screen.getByText("check this out")).toBeInTheDocument();
  expect(screen.getByAltText("photo.png")).toHaveAttribute("src", "http://files/photo.png");
  expect(screen.getByText("notes.pdf")).toBeInTheDocument();
  expect(screen.getByText("legacy-plain.txt")).toBeInTheDocument();

  const imageLink = screen.getByRole("link", { name: "Open photo.png" });
  expect(imageLink).toHaveAttribute("href", "http://files/photo.png");
  expect(imageLink).toHaveAttribute("target", "_blank");

  const chipLink = screen.getByText("notes.pdf").closest("a");
  expect(chipLink).toHaveAttribute("href", "http://files/notes.pdf");
  expect(chipLink).toHaveAttribute("target", "_blank");
});

test("renders agent markdown text with a copy button once complete, none while streaming", () => {
  useChatStore.setState({ turns: [agentTurn({ text: "**bold answer**", status: "streaming" })] });
  const { rerender } = render(<Conversation />);
  expect(screen.getByText("bold answer")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /copy response/i })).not.toBeInTheDocument();

  useChatStore.setState({ turns: [agentTurn({ text: "**bold answer**", status: "complete" })] });
  rerender(<Conversation />);
  expect(screen.getByRole("button", { name: /copy response/i })).toBeInTheDocument();
});

test("shows a collapsible thinking block for reasoning text, auto-collapsing once streaming ends", async () => {
  useChatStore.setState({ turns: [agentTurn({ reasoning: "pondering deeply", status: "streaming" })] });
  const { rerender } = render(<Conversation />);
  expect(screen.getByText("pondering deeply")).toBeInTheDocument();

  useChatStore.setState({ turns: [agentTurn({ reasoning: "pondering deeply", status: "complete" })] });
  rerender(<Conversation />);
  await waitFor(() => expect(screen.queryByText("pondering deeply")).not.toBeInTheDocument());

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /thinking/i }));
  expect(screen.getByText("pondering deeply")).toBeInTheDocument();
});

test("collapses the thinking block as soon as response text starts streaming, before the turn completes", async () => {
  useChatStore.setState({ turns: [agentTurn({ reasoning: "pondering deeply", status: "streaming" })] });
  const { rerender } = render(<Conversation />);
  expect(screen.getByText("pondering deeply")).toBeInTheDocument();

  useChatStore.setState({
    turns: [agentTurn({ reasoning: "pondering deeply", text: "here's the answer", status: "streaming" })],
  });
  rerender(<Conversation />);
  await waitFor(() => expect(screen.queryByText("pondering deeply")).not.toBeInTheDocument());
  expect(screen.getByText("here's the answer")).toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /thinking/i }));
  expect(screen.getByText("pondering deeply")).toBeInTheDocument();

  // Manual reopen must survive further streaming and turn completion, not just the next render.
  useChatStore.setState({
    turns: [agentTurn({ reasoning: "pondering deeply", text: "here's the full answer", status: "complete" })],
  });
  rerender(<Conversation />);
  expect(screen.getByText("pondering deeply")).toBeInTheDocument();
});

test("shows an idle 'Thinking' indicator for a streaming turn with no content yet", () => {
  useChatStore.setState({ turns: [agentTurn({ status: "streaming" })] });
  render(<Conversation />);
  expect(screen.getByText("Thinking")).toBeInTheDocument();
});

test("shows a canceled/failed status message", () => {
  useChatStore.setState({ turns: [agentTurn({ status: "canceled" })] });
  const { rerender } = render(<Conversation />);
  expect(screen.getByText("Stopped.")).toBeInTheDocument();

  useChatStore.setState({ turns: [agentTurn({ status: "failed", error: "boom" })] });
  rerender(<Conversation />);
  expect(screen.getByText("boom")).toBeInTheDocument();
});

test("failed/canceled turns show a copy button only when partial text streamed in", () => {
  useChatStore.setState({ turns: [agentTurn({ status: "failed", error: "boom", text: "" })] });
  const { rerender } = render(<Conversation />);
  expect(screen.queryByRole("button", { name: /copy response/i })).not.toBeInTheDocument();

  useChatStore.setState({ turns: [agentTurn({ status: "failed", error: "boom", text: "partial answer" })] });
  rerender(<Conversation />);
  expect(screen.getByRole("button", { name: /copy response/i })).toBeInTheDocument();

  useChatStore.setState({ turns: [agentTurn({ status: "canceled", text: "" })] });
  rerender(<Conversation />);
  expect(screen.queryByRole("button", { name: /copy response/i })).not.toBeInTheDocument();

  useChatStore.setState({ turns: [agentTurn({ status: "canceled", text: "partial answer" })] });
  rerender(<Conversation />);
  expect(screen.getByRole("button", { name: /copy response/i })).toBeInTheDocument();
});

test("agent copy button copies the raw markdown text to the clipboard", async () => {
  useChatStore.setState({ turns: [agentTurn({ status: "complete", text: "**bold answer**" })] });
  const user = userEvent.setup();
  render(<Conversation />);

  await user.click(screen.getByRole("button", { name: /copy response/i }));

  await expect(navigator.clipboard.readText()).resolves.toBe("**bold answer**");
});

test("user turn shows a copy button that copies exactly the typed text, not markdown-rendered", async () => {
  useChatStore.setState({ turns: [userTurn({ text: "**not bold**, just typed" })] });
  const user = userEvent.setup();
  render(<Conversation />);

  const button = screen.getByRole("button", { name: /copy message/i });
  await user.click(button);

  await expect(navigator.clipboard.readText()).resolves.toBe("**not bold**, just typed");
});

test("a user turn with only attachments (no text) shows no copy button", () => {
  useChatStore.setState({
    turns: [userTurn({ text: "", attachments: [{ name: "a.png", url: "http://x/a.png", mimeType: "image/png", size: 1 }] })],
  });
  render(<Conversation />);
  expect(screen.queryByRole("button", { name: /copy message/i })).not.toBeInTheDocument();
});

test("renders an absolute timestamp (with a full-date tooltip) when the turn has one, and none for legacy turns without it", () => {
  const ts = Date.now();
  useChatStore.setState({
    turns: [userTurn({ text: "hi", timestamp: ts }), agentTurn({ status: "complete", text: "hello" })],
  });
  render(<Conversation />);

  const label = screen.getByText(formatMessageTime(ts, Date.now()));
  expect(label).toHaveAttribute("title", formatFullDateTime(ts));

  // The agent turn has no `timestamp` (simulating a pre-feature persisted conversation) — its
  // copy button still renders, just with no timestamp label alongside it.
  expect(screen.getByRole("button", { name: /copy response/i })).toBeInTheDocument();
});

test("timestamp and copy are always visible, not hover-gated", () => {
  useChatStore.setState({
    turns: [agentTurn({ status: "complete", text: "hello", timestamp: Date.now() })],
  });
  render(<Conversation />);
  const button = screen.getByRole("button", { name: /copy response/i });
  expect(button.className).not.toMatch(/opacity-0/);
  expect(button.parentElement?.className ?? "").not.toMatch(/opacity-0/);
});

test("renders a generic tool call's args and output as raw JSON once expanded", async () => {
  useChatStore.setState({
    turns: [agentTurn({ tools: [{ id: "t1", name: "web_search", args: { query: "cats" }, output: "some result", status: "completed" }] })],
  });
  const user = userEvent.setup();
  render(<Conversation />);
  expect(screen.getByText("web_search")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /web_search/i }));

  expect(screen.getByText(/"query": "cats"/)).toBeInTheDocument();
  expect(screen.getByText("some result")).toBeInTheDocument();
});

test("a running tool shows 'running…' status", () => {
  useChatStore.setState({
    turns: [agentTurn({ tools: [{ id: "t1", name: "web_search", status: "started" }] })],
  });
  render(<Conversation />);
  expect(screen.getByText("running…")).toBeInTheDocument();
});

test("renders a generate_image tool's result inline with the reply text, and its tool row stays compact with raw input/output", async () => {
  useChatStore.setState({
    turns: [
      agentTurn({
        text: "Here's an image of a fox in snow.",
        tools: [
          {
            id: "t1",
            name: "generate_image",
            args: { prompt: "a fox in snow", width: 512 },
            output: JSON.stringify({ url: "http://files/fox.png", prompt: "a fox in snow" }),
            status: "completed",
          },
        ],
      }),
    ],
  });
  render(<Conversation />);

  // Image renders as part of the reply, not inside the (collapsed by default) tool row.
  expect(screen.getByAltText("a fox in snow")).toHaveAttribute("src", "http://files/fox.png");
  expect(screen.getByText("a fox in snow")).toBeInTheDocument();
  expect(screen.getByText(/here's an image of a fox in snow/i)).toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /generate_image/i }));
  expect(screen.getByText("Input")).toBeInTheDocument();
  expect(screen.getByText(/"width": 512/)).toBeInTheDocument();
  expect(screen.getByText("Output")).toBeInTheDocument();
  expect(screen.getByText(/"url": "http:\/\/files\/fox.png"/)).toBeInTheDocument();
});

test("renders search_documents results as source cards, plus raw input/output", () => {
  const hits = [{ documentId: "d1", documentName: "report.pdf", page: "3", text: "relevant excerpt" }];
  useChatStore.setState({
    turns: [agentTurn({ tools: [{ id: "t1", name: "search_documents", args: { query: "q" }, output: JSON.stringify(hits), status: "completed" }] })],
  });
  render(<Conversation />);
  expect(screen.getByText("report.pdf")).toBeInTheDocument();
  expect(screen.getByText("relevant excerpt")).toBeInTheDocument();
  expect(screen.getByText("p.3")).toBeInTheDocument();
  expect(screen.getByText("Input")).toBeInTheDocument();
  expect(screen.getByText(/"query": "q"/)).toBeInTheDocument();
  expect(screen.getByText("Output")).toBeInTheDocument();
  expect(screen.getByText(/"documentName": "report.pdf"/)).toBeInTheDocument();
});

test("renders summarize_document output as markdown, plus raw input/output", () => {
  useChatStore.setState({
    turns: [agentTurn({ tools: [{ id: "t1", name: "summarize_document", args: { documentId: "d1" }, output: "A **summary**.", status: "completed" }] })],
  });
  render(<Conversation />);
  expect(screen.getByText("summary")).toBeInTheDocument();
  expect(screen.getByText("Input")).toBeInTheDocument();
  expect(screen.getByText(/"documentId": "d1"/)).toBeInTheDocument();
  expect(screen.getByText("Output")).toBeInTheDocument();
  expect(screen.getByText("A **summary**.")).toBeInTheDocument();
});

test("renders view_document_page's image in the tool row, plus raw input/output", () => {
  useChatStore.setState({
    turns: [
      agentTurn({
        tools: [
          {
            id: "t1",
            name: "view_document_page",
            args: { documentId: "d1", page: 3 },
            output: JSON.stringify({ url: "http://files/page3.png", documentName: "report.pdf", page: 3 }),
            status: "completed",
          },
        ],
      }),
    ],
  });
  render(<Conversation />);
  expect(screen.getByAltText("Document page")).toHaveAttribute("src", "http://files/page3.png");
  expect(screen.getByText("Input")).toBeInTheDocument();
  expect(screen.getByText(/"documentId": "d1"/)).toBeInTheDocument();
  expect(screen.getByText("Output")).toBeInTheDocument();
  expect(screen.getByText(/"documentName": "report.pdf"/)).toBeInTheDocument();
});

test("renders a subagent delegation row", () => {
  useChatStore.setState({
    turns: [agentTurn({ subagents: [{ id: "s1", name: "researcher", status: "completed", output: "found it" }] })],
  });
  render(<Conversation />);
  expect(screen.getByText("Subagent: researcher")).toBeInTheDocument();
});

test("renders a compaction notice, expandable to show the summary", async () => {
  useChatStore.setState({
    turns: [agentTurn({ compactions: [{ id: "c1", summary: "older stuff summarized" }] })],
  });
  const user = userEvent.setup();
  render(<Conversation />);
  expect(screen.getByText("Older messages compacted")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /older messages compacted/i }));

  expect(screen.getByText("older stuff summarized")).toBeInTheDocument();
});

test("approving a pending action calls respond() with approve decisions and disables the buttons", async () => {
  const respond = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useChat).mockReturnValue({ send: vi.fn(), respond, stop: vi.fn() });
  useChatStore.setState({
    turns: [agentTurn({ status: "input-required", approvals: [{ name: "send_email", args: { to: "x" }, description: "Send an email" }] })],
  });
  const user = userEvent.setup();
  render(<Conversation />);

  await user.click(screen.getByRole("button", { name: "Approve" }));

  expect(respond).toHaveBeenCalledWith([{ type: "approve" }]);
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
});

test("rejecting a pending action calls respond() with a reject decision + message", async () => {
  const respond = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useChat).mockReturnValue({ send: vi.fn(), respond, stop: vi.fn() });
  useChatStore.setState({
    turns: [agentTurn({ status: "input-required", approvals: [{ name: "run_javascript", args: { code: "1+1" } }] })],
  });
  const user = userEvent.setup();
  render(<Conversation />);

  await user.click(screen.getByRole("button", { name: "Reject" }));

  expect(respond).toHaveBeenCalledWith([{ type: "reject", message: "The user declined this action." }]);
});
