export function TrustMeter({ trust, multiplier, paused }: { trust: number; multiplier: number; paused: boolean }) {
  const pct = Math.max(0, Math.min(100, trust));
  const tone = paused ? "bg-red-500" : trust < 40 ? "bg-amber-500" : trust > 80 ? "bg-[linear-gradient(90deg,#9945ff,#14f195)]" : "bg-primary";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">Trust score</span>
        <span className="font-mono font-medium">{trust.toFixed(0)}<span className="text-muted-foreground">/100</span></span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 left-[25%] w-px bg-background/80" title="pause threshold" />
        <div className="absolute inset-y-0 left-[40%] w-px bg-background/80" />
        <div className="absolute inset-y-0 left-[80%] w-px bg-background/80" />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{paused ? "Payouts paused for review" : `Pay multiplier ×${multiplier}`}</span>
        <span>0.5× · 1× · 1.5×</span>
      </div>
    </div>
  );
}
