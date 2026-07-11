import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

vi.mock("../hooks/useChat", () => ({ useChat: vi.fn() }));

import { useChat } from "../hooks/useChat";
import { useChatStore, type UITurn } from "../store/chat";
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

test("renders a generate_image tool's result as an image with its prompt caption", () => {
  useChatStore.setState({
    turns: [
      agentTurn({
        tools: [
          {
            id: "t1",
            name: "generate_image",
            args: { prompt: "a fox in snow" },
            output: JSON.stringify({ url: "http://files/fox.png" }),
            status: "completed",
          },
        ],
      }),
    ],
  });
  render(<Conversation />);
  expect(screen.getByAltText("a fox in snow")).toHaveAttribute("src", "http://files/fox.png");
  expect(screen.getByText("a fox in snow")).toBeInTheDocument();
});

test("renders search_documents results as source cards", () => {
  const hits = [{ documentId: "d1", documentName: "report.pdf", page: "3", text: "relevant excerpt" }];
  useChatStore.setState({
    turns: [agentTurn({ tools: [{ id: "t1", name: "search_documents", args: { query: "q" }, output: JSON.stringify(hits), status: "completed" }] })],
  });
  render(<Conversation />);
  expect(screen.getByText("report.pdf")).toBeInTheDocument();
  expect(screen.getByText("relevant excerpt")).toBeInTheDocument();
  expect(screen.getByText("p.3")).toBeInTheDocument();
});

test("renders summarize_document output as markdown", () => {
  useChatStore.setState({
    turns: [agentTurn({ tools: [{ id: "t1", name: "summarize_document", args: {}, output: "A **summary**.", status: "completed" }] })],
  });
  render(<Conversation />);
  expect(screen.getByText("summary")).toBeInTheDocument();
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
