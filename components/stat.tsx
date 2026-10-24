export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "default" | "muted" | "warn" | "bad" }) {
  const color = tone === "warn" ? "text-amber-700 dark:text-amber-300" : tone === "bad" ? "text-red-700 dark:text-red-300" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[15px] text-muted-foreground">
        {label}
        {hint && (
          <span className="inline-flex size-4 cursor-help items-center justify-center rounded-full border text-[10px] leading-none" title={hint} aria-label={hint}>
            i
          </span>
        )}
      </p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${color}`}>{value}</p>
    </div>
  );
}
