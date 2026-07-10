/**
 * AI-first home screen — a hyper-minimalist, Gemini-inspired landing page.
 *
 * The layout is a single non-scrolling viewport: a thin floating icon rail on
 * the left and a vertically + horizontally centered "prompt hub" in the middle,
 * sitting on top of a soft pastel aurora glow.
 */

const USER_NAME = 'Chintan'

function App() {
  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-white font-sans text-slate-800 antialiased">
      <AuroraGlow />
      <Sidebar />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <h1 className="mb-10 text-center text-4xl font-medium tracking-tight text-slate-900 sm:text-5xl">
          Hi {USER_NAME},{' '}
          <span className="bg-linear-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">
            let&apos;s get started
          </span>
        </h1>

        <PromptBar />
      </main>
    </div>
  )
}

/**
 * The soft radial "AI glow". A few blurred, translucent blobs stacked behind
 * the prompt hub that fade out smoothly into the white edges of the screen.
 */
function AuroraGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute left-1/2 top-[62%] h-[38rem] w-[56rem] -translate-1/2 animate-[float_9s_ease-in-out_infinite] rounded-full bg-blue-400/20 blur-3xl" />
      <div className="absolute left-[44%] top-[58%] h-[24rem] w-[34rem] -translate-1/2 animate-[float_11s_ease-in-out_infinite_reverse] rounded-full bg-indigo-300/25 blur-3xl" />
      <div className="absolute left-[57%] top-[66%] h-[22rem] w-[30rem] -translate-1/2 animate-[float_13s_ease-in-out_infinite] rounded-full bg-sky-300/20 blur-3xl" />
    </div>
  )
}

/** Thin, floating vertical icon rail pinned to the far left. */
function Sidebar() {
  return (
    <nav className="relative z-20 flex h-full w-16 flex-col items-center justify-between py-6">
      <div className="flex flex-col items-center gap-2">
        <RailButton label="New chat">
          <PlusIcon />
        </RailButton>
        <RailButton label="History">
          <HistoryIcon />
        </RailButton>
        <RailButton label="Explore">
          <ExploreIcon />
        </RailButton>
        <RailButton label="Settings">
          <SettingsIcon />
        </RailButton>
      </div>

      <button
        type="button"
        aria-label="Profile"
        className="flex size-9 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-500 text-sm font-medium text-white transition-transform hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
      >
        {USER_NAME.charAt(0)}
      </button>
    </nav>
  )
}

function RailButton({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="group flex size-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
    >
      {children}
    </button>
  )
}

/**
 * The central interaction hub — an ultra-rounded pill with a "+" action, the
 * text input, a model selector, and a microphone action.
 */
function PromptBar() {
  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center gap-3 rounded-full bg-white/70 px-3 py-2.5 ring-1 ring-slate-200/70 backdrop-blur-md transition focus-within:ring-blue-300/70">
        <button
          type="button"
          aria-label="Add attachment"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          <PlusIcon />
        </button>

        <input
          type="text"
          placeholder="Ask anything..."
          aria-label="Ask anything"
          className="min-w-0 flex-1 bg-transparent text-base text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
        />

        <ModelSelector />

        <button
          type="button"
          aria-label="Voice input"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
        >
          <MicIcon />
        </button>
      </div>
    </div>
  )
}

/** Dropdown-style pill that selects the model / version. */
function ModelSelector() {
  return (
    <button
      type="button"
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100/80 py-1.5 pl-3 pr-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/80 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/60"
    >
      <SparkleIcon />
      <span className="hidden sm:inline">Opus 4.8</span>
      <ChevronDownIcon />
    </button>
  )
}

/* --- Thin-line icons (1.5px stroke, inherit currentColor) --------------- */

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function PlusIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function ExploreIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m14.8 9.2-1.6 4.6-4.6 1.6 1.6-4.6z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg {...iconProps} width={16} height={16} className="text-blue-500">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4z" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default App
