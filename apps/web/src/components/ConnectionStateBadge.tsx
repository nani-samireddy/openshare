type ConnectionStateBadgeProps = {
  connected: boolean;
};

export function ConnectionStateBadge({ connected }: ConnectionStateBadgeProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-cream px-3 py-1 text-xs font-extrabold text-ink">
      <span className={`h-2.5 w-2.5 rounded-full border border-ink ${connected ? "bg-sun" : "bg-sky"}`} />
      {connected ? "Connected" : "Connecting"}
    </span>
  );
}
