"use client";

import { useState } from "react";
import type { ServedTask, TextPayload, PairwisePayload, ImagePayload } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { sol } from "@/components/format";

export function TaskCard({ task, onSubmit, busy }: { task: ServedTask; onSubmit: (answer: string) => void; busy: boolean }) {
  const [choice, setChoice] = useState<string | null>(null);
  const submit = (a: string) => {
    setChoice(a);
    onSubmit(a);
  };
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{task.type} · {task.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{task.guidelines}</p>
        </div>
        <span className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">base {sol(task.payLamports, 3)}</span>
      </div>
      {task.modelConfidence != null && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Why you:</span> the first-pass model was only {Math.round(task.modelConfidence * 100)}% sure.
          {task.modelRationale ? ` ${task.modelRationale}` : ""}
        </p>
      )}

      {task.type === "text" && (
        <blockquote className="rounded-2xl border bg-muted/40 p-6 text-xl leading-relaxed">“{(task.payload as TextPayload).text}”</blockquote>
      )}

      {task.type === "pairwise" && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/50 p-4 text-sm"><span className="font-medium">User:</span> {(task.payload as PairwisePayload).prompt}</div>
          <div className="grid gap-3 md:grid-cols-2">
            {(["a", "b"] as const).map((k) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => submit(k.toUpperCase())}
                className={`rounded-xl border bg-card p-4 text-left text-sm leading-relaxed transition hover:border-primary hover:shadow-sm disabled:opacity-60 ${choice === k.toUpperCase() ? "border-primary ring-2 ring-primary/30" : ""}`}
              >
                <span className="mb-2 inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">Response {k.toUpperCase()}</span>
                <p className="whitespace-pre-wrap">{(task.payload as PairwisePayload)[k]}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {task.type === "image" && (
        <div className="overflow-hidden rounded-xl border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={(task.payload as ImagePayload).src} alt="Item to label" className="mx-auto max-h-[420px] w-full object-contain bg-black/5" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {task.options
          .filter((o) => !(task.type === "pairwise" && (o === "A" || o === "B")))
          .map((o) => (
            <Button key={o} variant={choice === o ? "default" : "outline"} size="lg" disabled={busy} onClick={() => submit(o)} className="min-w-28 capitalize">
              {o}
            </Button>
          ))}
      </div>
      <p className="text-xs text-muted-foreground">Keyboard: press 1–{task.options.length} to answer.</p>
    </div>
  );
}
