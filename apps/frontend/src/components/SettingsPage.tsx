/** Full-page Settings: appearance + local Ollama model management (search, download, delete, set defaults). */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  ArrowDownTrayIcon,
  CircleStackIcon,
  ComputerDesktopIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PhotoIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  deleteModel,
  fetchAllModels,
  isEmbeddingEligible,
  isImageGenEligible,
  isOrchestratorEligible,
  pullModel,
  setDefaultModel,
  setEmbeddingModel,
  setImageGenModel,
  type ModelSummary,
  type PullProgressEvent,
} from "../lib/modelManagement";
import { formatBytes } from "../lib/format";
import { useThemeStore, type ThemePreference } from "../store/theme";

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: "auto", label: "Auto", icon: ComputerDesktopIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

const CAPABILITY_LABELS: Record<string, string> = {
  tools: "tools",
  vision: "vision",
  audio: "audio",
  thinking: "thinking",
  embedding: "embedding",
  image: "image-gen",
};

interface PullState {
  name: string;
  event: PullProgressEvent;
}

export function SettingsPage() {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [defaultModel, setDefaultModelName] = useState<string | null>(null);
  const [imageGenModel, setImageGenModelName] = useState<string | null>(null);
  const [embeddingModel, setEmbeddingModelName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmingName, setConfirmingName] = useState<string | null>(null);
  const [pendingEmbeddingDefault, setPendingEmbeddingDefault] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("");
  const [pull, setPull] = useState<PullState | null>(null);

  function refresh() {
    setLoading(true);
    fetchAllModels()
      .then((r) => {
        setModels(r.models);
        setDefaultModelName(r.defaultModel);
        setImageGenModelName(r.imageGenModel);
        setEmbeddingModelName(r.embeddingModel);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((m) => m.name.toLowerCase().includes(needle));
  }, [models, query]);

  const chatModels = useMemo(() => filtered.filter((m) => isOrchestratorEligible(m.capabilities)), [filtered]);
  const imageModels = useMemo(() => filtered.filter((m) => isImageGenEligible(m.capabilities)), [filtered]);
  const embeddingModels = useMemo(() => filtered.filter((m) => isEmbeddingEligible(m.capabilities)), [filtered]);
  const hasChatModels = useMemo(() => models.some((m) => isOrchestratorEligible(m.capabilities)), [models]);
  const hasImageModels = useMemo(() => models.some((m) => isImageGenEligible(m.capabilities)), [models]);
  const hasEmbeddingModels = useMemo(() => models.some((m) => isEmbeddingEligible(m.capabilities)), [models]);

  async function handleDownload(e: FormEvent) {
    e.preventDefault();
    const name = downloadName.trim();
    if (!name || pull) return;
    setActionError(null);
    setPull({ name, event: { status: "starting" } });
    try {
      await pullModel(name, (event) => setPull({ name, event }));
      setDownloadName("");
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setPull(null);
    }
  }

  async function handleSetOrchestratorDefault(name: string) {
    const previous = defaultModel;
    setActionError(null);
    setDefaultModelName(name);
    try {
      await setDefaultModel(name);
    } catch (err) {
      setDefaultModelName(previous);
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSetImageGenDefault(name: string) {
    const previous = imageGenModel;
    setActionError(null);
    setImageGenModelName(name);
    try {
      await setImageGenModel(name);
    } catch (err) {
      setImageGenModelName(previous);
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function commitEmbeddingDefault(name: string) {
    const previous = embeddingModel;
    setActionError(null);
    setEmbeddingModelName(name);
    try {
      await setEmbeddingModel(name);
    } catch (err) {
      setEmbeddingModelName(previous);
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  // Changing the embedding default is destructive to existing document search
  // (old chunks stay embedded with the old model), so it requires a second,
  // confirming click before it takes effect — same two-step shape as delete.
  function handleSetEmbeddingDefault(name: string) {
    if (pendingEmbeddingDefault !== name) {
      setPendingEmbeddingDefault(name);
      return;
    }
    setPendingEmbeddingDefault(null);
    void commitEmbeddingDefault(name);
  }

  async function handleDelete(name: string) {
    if (confirmingName !== name) {
      setConfirmingName(name);
      return;
    }
    setConfirmingName(null);
    setActionError(null);
    const wasDefault = defaultModel === name || imageGenModel === name || embeddingModel === name;
    setModels((prev) => prev.filter((m) => m.name !== name));
    try {
      await deleteModel(name);
      if (wasDefault) refresh(); // pick up the server's reverted default(s)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      refresh();
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 pt-6 pb-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <h1 className="text-2xl font-medium tracking-tight text-slate-900 dark:text-slate-100">Settings</h1>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">
              Appearance
            </h2>
            <AppearanceControl />
          </section>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-1 pb-10">
          <h2 className="text-xs font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">Models</h2>

          <form onSubmit={(e) => void handleDownload(e)} className="flex items-center gap-2">
            <div className="flex min-w-56 flex-1 items-center gap-2 rounded-full bg-white/70 px-4 py-2.5 ring-1 ring-slate-200/70 backdrop-blur-md transition focus-within:ring-blue-300/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
              <input
                type="text"
                value={downloadName}
                onChange={(e) => setDownloadName(e.target.value)}
                placeholder="e.g. llama3.1:8b"
                aria-label="Model name to download"
                disabled={pull !== null}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden disabled:opacity-50 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            <button
              type="submit"
              disabled={!downloadName.trim() || pull !== null}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100/80 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/80 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:opacity-50 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80"
            >
              <ArrowDownTrayIcon className="size-4" aria-hidden="true" />
              Download
            </button>
          </form>

          {pull && <PullProgressRow pull={pull} />}
          {actionError && <p className="px-2 py-1 text-sm text-rose-500 dark:text-rose-400">{actionError}</p>}

          <div className="flex min-w-56 items-center gap-2 rounded-full bg-white/70 px-3 py-2 ring-1 ring-slate-200/70 backdrop-blur-md focus-within:ring-blue-300/70 dark:bg-slate-900/70 dark:ring-slate-700/60">
            <MagnifyingGlassIcon className="size-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models..."
              aria-label="Search models"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex flex-col gap-4">
            {loadError && <p className="px-2 py-1 text-sm text-rose-500 dark:text-rose-400">{loadError}</p>}
            {!loading && !loadError && models.length === 0 && (
              <p className="px-2 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                No models installed — download one above.
              </p>
            )}
            {!loadError && hasChatModels && (
              <ModelSection title="Text Generation Model" items={chatModels}>
                {(m) => (
                  <ModelRow
                    key={m.name}
                    model={m}
                    defaultAction={{
                      role: "orchestration default",
                      icon: StarIcon,
                      isDefault: m.name === defaultModel,
                      onSet: () => void handleSetOrchestratorDefault(m.name),
                    }}
                    deleteConfirming={confirmingName === m.name}
                    onDelete={() => void handleDelete(m.name)}
                  />
                )}
              </ModelSection>
            )}
            {!loadError && hasImageModels && (
              <ModelSection title="Image Generation Model" items={imageModels}>
                {(m) => (
                  <ModelRow
                    key={m.name}
                    model={m}
                    defaultAction={{
                      role: "image-generation default",
                      icon: PhotoIcon,
                      isDefault: m.name === imageGenModel,
                      onSet: () => void handleSetImageGenDefault(m.name),
                    }}
                    deleteConfirming={confirmingName === m.name}
                    onDelete={() => void handleDelete(m.name)}
                  />
                )}
              </ModelSection>
            )}
            {!loadError && hasEmbeddingModels && (
              <ModelSection title="Embedding Models" items={embeddingModels}>
                {(m) => (
                  <ModelRow
                    key={m.name}
                    model={m}
                    defaultAction={{
                      role: "embedding default",
                      icon: CircleStackIcon,
                      isDefault: m.name === embeddingModel,
                      onSet: () => handleSetEmbeddingDefault(m.name),
                      confirming: pendingEmbeddingDefault === m.name,
                      confirmText:
                        "Tap again to confirm — existing documents won't be searchable correctly until re-ingested.",
                    }}
                    deleteConfirming={confirmingName === m.name}
                    onDelete={() => void handleDelete(m.name)}
                  />
                )}
              </ModelSection>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PullProgressRow({ pull }: { pull: PullState }) {
  const { status, completed, total } = pull.event;
  const pct = total && completed !== undefined ? Math.min(completed / total, 1) : null;
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-slate-200/70 backdrop-blur-md dark:bg-slate-900/70 dark:ring-slate-700/60">
      <div className="flex items-center justify-between text-sm">
        <span className="truncate font-medium text-slate-700 dark:text-slate-200">{pull.name}</span>
        {pct !== null && <span className="shrink-0 text-slate-400 dark:text-slate-500">{Math.round(pct * 100)}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={`Downloading ${pull.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct !== null ? Math.round(pct * 100) : undefined}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100/80 dark:bg-slate-800/80"
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-blue-500 to-indigo-500 transition-[width] duration-300"
          style={{ width: `${(pct ?? 0) * 100}%` }}
        />
      </div>
      <span className="truncate text-xs text-slate-400 dark:text-slate-500">
        {status}
        {total && completed !== undefined ? ` — ${formatBytes(completed)} / ${formatBytes(total)}` : ""}
      </span>
    </div>
  );
}

function CapabilityBadges({ capabilities }: { capabilities: string[] }) {
  const tags = capabilities.filter((c) => CAPABILITY_LABELS[c]).map((c) => CAPABILITY_LABELS[c]!);
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
        >
          {t}
        </span>
      ))}
    </span>
  );
}

function ModelSection({
  title,
  items,
  children,
}: {
  title: string;
  items: ModelSummary[];
  children: (model: ModelSummary) => ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-2 text-[11px] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="px-2 py-4 text-center text-sm text-slate-400 dark:text-slate-500">No matches.</p>
      ) : (
        items.map(children)
      )}
    </section>
  );
}

interface DefaultAction {
  /** Used in aria-labels, e.g. "orchestration default" / "image-generation default" / "embedding default". */
  role: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  isDefault: boolean;
  onSet: () => void;
  /** True while a second confirming click is pending before `onSet` takes effect (e.g. embedding default). */
  confirming?: boolean;
  /** Warning shown under the row while `confirming` is true. */
  confirmText?: string;
}

function ModelRow({
  model,
  defaultAction,
  deleteConfirming,
  onDelete,
}: {
  model: ModelSummary;
  defaultAction?: DefaultAction;
  deleteConfirming: boolean;
  onDelete: () => void;
}) {
  const isDefault = defaultAction?.isDefault ?? false;
  const defaultConfirming = defaultAction?.confirming ?? false;
  return (
    <div className="flex flex-col rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800">
      <div className="group flex items-center gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{model.name}</span>
            {isDefault && (
              <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                Default
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 dark:text-slate-500">{formatBytes(model.size)}</span>
            <CapabilityBadges capabilities={model.capabilities} />
          </span>
        </div>
        {defaultAction && (
          <button
            type="button"
            aria-label={
              defaultAction.isDefault
                ? `${model.name} is the ${defaultAction.role}`
                : defaultConfirming
                  ? `Confirm ${model.name} as the ${defaultAction.role}`
                  : `Set ${model.name} as the ${defaultAction.role}`
            }
            aria-pressed={defaultAction.isDefault}
            disabled={defaultAction.isDefault}
            onClick={defaultAction.onSet}
            className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
              defaultAction.isDefault
                ? "text-blue-500 dark:text-blue-400"
                : defaultConfirming
                  ? "bg-rose-100 text-rose-600 opacity-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30"
                  : "text-slate-300 opacity-0 hover:bg-slate-200 hover:text-slate-600 group-hover:opacity-100 focus-visible:opacity-100 dark:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <defaultAction.icon className="size-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          aria-label={deleteConfirming ? `Confirm delete "${model.name}"` : `Delete "${model.name}"`}
          onClick={onDelete}
          className={`mr-1 flex size-8 shrink-0 items-center justify-center rounded-full opacity-0 transition-colors group-hover:opacity-100 focus-visible:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
            deleteConfirming
              ? "bg-rose-100 text-rose-600 opacity-100 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/30"
              : "text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          }`}
        >
          <TrashIcon className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {deleteConfirming && (
        <p className="px-3 pb-2 text-xs text-rose-500 dark:text-rose-400">Tap delete again to remove.</p>
      )}
      {defaultConfirming && defaultAction?.confirmText && (
        <p className="px-3 pb-2 text-xs text-rose-500 dark:text-rose-400">{defaultAction.confirmText}</p>
      )}
    </div>
  );
}

function AppearanceControl() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const buttonRefs = useRef<Partial<Record<ThemePreference, HTMLButtonElement>>>({});

  function move(delta: 1 | -1) {
    const i = APPEARANCE_OPTIONS.findIndex((o) => o.value === preference);
    const next = APPEARANCE_OPTIONS[(i + delta + APPEARANCE_OPTIONS.length) % APPEARANCE_OPTIONS.length];
    if (!next) return;
    setPreference(next.value);
    // Roving tabindex: keyboard focus must follow the newly active radio, not stay put.
    buttonRefs.current[next.value]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex w-fit gap-1 rounded-full bg-slate-100/80 p-1 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:ring-slate-700/60"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {APPEARANCE_OPTIONS.map(({ value, label, icon: Icon }) => {
        const checked = value === preference;
        return (
          <button
            key={value}
            ref={(el) => {
              buttonRefs.current[value] = el ?? undefined;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => setPreference(value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 px-4 text-sm font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
              checked
                ? "bg-white text-slate-900 dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
