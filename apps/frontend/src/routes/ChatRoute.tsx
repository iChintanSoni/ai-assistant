/** The chat view: the empty-state hub, or the live transcript once a turn exists. */
import { useOutletContext } from "react-router";
import { Composer } from "../components/Composer";
import { Conversation } from "../components/Conversation";
import { DropOverlay } from "../components/DropOverlay";
import { useFileDrop } from "../hooks/useFileDrop";
import { USER_NAME } from "../lib/config";
import { useChatStore } from "../store/chat";
import type { AttachmentsContext } from "./RootLayout";
import { PageMain } from "./PageMain";

export function ChatRoute() {
  const turns = useChatStore((s) => s.turns);
  const modelsError = useChatStore((s) => s.modelsError);
  // Owned by RootLayout so it survives a trip to Files/Settings — see there.
  const attachments = useOutletContext<AttachmentsContext>();
  const { isDraggingFiles, dropZoneProps } = useFileDrop(attachments.addFiles);
  const hasChat = turns.length > 0;

  return (
    <PageMain {...dropZoneProps}>
      <DropOverlay visible={isDraggingFiles} />
      {hasChat ? (
        <>
          <Conversation />
          <div className="shrink-0 pt-2 pb-6">
            <Composer {...attachments} />
            <ErrorNote message={modelsError} />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center">
          <h1 className="mb-10 text-center text-4xl font-medium tracking-tight text-slate-900 sm:text-5xl dark:text-slate-100">
            Hi {USER_NAME},{" "}
            <span className="bg-linear-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
              let&apos;s get started
            </span>
          </h1>
          <Composer {...attachments} />
          <ErrorNote message={modelsError} />
        </div>
      )}
    </PageMain>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mx-auto mt-3 max-w-2xl px-3 text-center text-sm text-rose-500 dark:text-rose-400">
      Can&apos;t reach the agent — {message}
    </p>
  );
}
