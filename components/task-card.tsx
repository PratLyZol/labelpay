"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, FileText, Image, ListOrdered } from "lucide-react";
import type { ImagePayload, PairwisePayload, ServedTask, TextPayload } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { sol } from "@/components/format";

const TYPE_META = {
  text: { label: "Sentiment", icon: FileText },
  pairwise: { label: "Compare", icon: ListOrdered },
  image: { label: "Identify", icon: Image },
} as const;

export function TaskCard({ task, onSubmit, busy }: { task: ServedTask; onSubmit: (answer: string) => void; busy: boolean }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const meta = TYPE_META[task.type];
  const TypeIcon = meta.icon;

  const advance = () => {
    const answer = customLabel.trim() || choice;
    if (answer && !busy) onSubmit(answer);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (busy) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const optionNumber = Number(event.key);
      if (optionNumber >= 1 && optionNumber <= task.options.length) {
        setCustomLabel("");
        setChoice(task.options[optionNumber - 1]);
        return;
      }
      if ((event.key === "ArrowRight" || event.key === "Enter") && choice) {
        event.preventDefault();
        onSubmit(choice);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, choice, onSubmit, task.options]);

  return (
    <article className="flash-card-enter overflow-hidden rounded-lg border bg-card shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-md border bg-white text-muted-foreground shadow-sm">
            <TypeIcon className="size-4" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium">{task.title}</p>
            <p className="text-xs text-muted-foreground">{meta.label} · {task.type === "image" ? "Choose a suggestion or enter your own" : "Choose one answer"}</p>
          </div>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs tabular-nums text-muted-foreground">{sol(task.payLamports, 3)} / card</span>
      </header>

      <div className="px-5 py-6 sm:px-7 sm:py-8">
        {task.type === "text" && (
          <div className="flex min-h-[250px] items-center justify-center rounded-lg border bg-gray-50 px-6 py-10 sm:px-12">
            <blockquote className="max-w-3xl text-center text-2xl font-medium leading-[1.45] tracking-[-0.025em] sm:text-[30px]">
              “{(task.payload as TextPayload).text}”
            </blockquote>
          </div>
        )}

        {task.type === "image" && (
          <div className="overflow-hidden rounded-lg border bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={(task.payload as ImagePayload).src} alt={(task.payload as ImagePayload).alt ?? "Photo to label"} className="mx-auto h-[260px] w-full object-contain sm:h-[390px]" />
          </div>
        )}

        {task.type === "pairwise" && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/35 px-4 py-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">User prompt</p>
              <p className="text-sm leading-6">{(task.payload as PairwisePayload).prompt}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {(["A", "B"] as const).map((answer) => {
                const key = answer.toLowerCase() as "a" | "b";
                const selected = choice === answer;
                return (
                  <button key={answer} type="button" onClick={() => setChoice(answer)} disabled={busy} aria-pressed={selected} className={`relative min-h-52 rounded-lg border p-5 text-left transition duration-200 disabled:opacity-60 ${selected ? "border-primary bg-indigo-50 ring-1 ring-primary" : "bg-white hover:border-gray-300 hover:bg-gray-50"}`}>
                    <span className={`mb-4 inline-flex size-7 items-center justify-center rounded-md text-xs font-semibold ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{answer}</span>
                    <p className="whitespace-pre-wrap text-sm leading-6">{(task.payload as PairwisePayload)[key]}</p>
                    {selected && <Check className="absolute right-4 top-4 size-4 text-primary" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {task.type !== "pairwise" && (
          <div className={`mt-5 grid gap-2.5 ${task.options.length > 3 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            {task.options.map((option, index) => {
              const selected = choice === option;
              return (
                <button key={option} type="button" onClick={() => { setCustomLabel(""); setChoice(option); }} disabled={busy} aria-pressed={selected} className={`flex min-h-14 items-center gap-3 rounded-md border px-4 text-left text-sm font-medium capitalize transition duration-200 disabled:opacity-60 ${selected ? "border-primary bg-indigo-50 text-indigo-950 ring-1 ring-primary" : "bg-white hover:border-gray-300 hover:bg-gray-50"}`}>
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index + 1}</span>
                  {option}
                  {selected && <Check className="ml-auto size-4 text-primary" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}

        {task.type === "image" && (
          <form className="mt-4" onSubmit={(event) => { event.preventDefault(); advance(); }}>
            <label htmlFor={`custom-label-${task.id}`} className="mb-2 block text-xs font-medium text-muted-foreground">Not listed? Enter the correct label</label>
            <input
              id={`custom-label-${task.id}`}
              name="customLabel"
              type="text"
              value={customLabel}
              maxLength={64}
              autoComplete="off"
              disabled={busy}
              placeholder="e.g. building, motorcycle, tree"
              onChange={(event) => { setCustomLabel(event.target.value); setChoice(null); }}
              className="h-12 w-full rounded-md border bg-white px-4 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </form>
        )}

        {task.type === "pairwise" && task.options.includes("tie") && (
          <button type="button" onClick={() => setChoice("tie")} disabled={busy} aria-pressed={choice === "tie"} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-medium transition disabled:opacity-60 ${choice === "tie" ? "border-primary bg-indigo-50 text-indigo-950 ring-1 ring-primary" : "bg-white text-muted-foreground hover:border-gray-300 hover:text-foreground"}`}>
            <span className="flex size-5 items-center justify-center rounded text-[10px] ring-1 ring-current/30">3</span>
            Both responses are equally good
            {choice === "tie" && <Check className="size-4 text-primary" aria-hidden="true" />}
          </button>
        )}

        {task.modelConfidence != null && (
          <details className="mt-5 text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer transition hover:text-foreground">Why this needed a human</summary>
            <p className="mt-2 max-w-2xl leading-5">The first pass was {Math.round(task.modelConfidence * 100)}% confident.{task.modelRationale ? ` ${task.modelRationale}` : ""}</p>
          </details>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t bg-gray-50 px-5 py-4 sm:px-7">
        <p className="text-xs text-muted-foreground"><span className="hidden sm:inline">Press 1–{task.options.length} to select · </span>{task.type === "image" ? "Or type a better label · " : ""}Right arrow or Enter to continue</p>
        <Button size="lg" onClick={advance} disabled={!(customLabel.trim() || choice) || busy} className="min-w-40">
          {busy ? "Checking…" : "Submit & next"}<ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </footer>
    </article>
  );
}
