"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, FileText, Image, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/use-session";

type ProjectType = "text" | "image";

interface CreatedProject {
  id: string;
  type: ProjectType;
  title: string;
  itemCount: number;
  payLamports: string;
}

function parseItems(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export default function NewProjectPage() {
  const { session } = useSession();
  const [type, setType] = useState<ProjectType>("text");
  const [title, setTitle] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [options, setOptions] = useState("");
  const [paySol, setPaySol] = useState("0.001");
  const [rawItems, setRawItems] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedProject | null>(null);

  const items = useMemo(() => parseItems(rawItems), [rawItems]);
  const labels = useMemo(() => options.split(",").map((option) => option.trim()).filter(Boolean), [options]);
  const maximumBudget = Number(paySol || 0) * items.length;

  const loadFile = async (file?: File) => {
    if (!file) return;
    setRawItems(await file.text());
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, guidelines, options: labels, paySol, items }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the project.");
      setCreated(data.project);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  };

  if (!session.loaded) return <div className="mx-auto max-w-6xl px-6 py-16 text-sm text-muted-foreground">Loading your workspace…</div>;

  if (!session.wallet) {
    return (
      <div className="paper-grid flex min-h-[calc(100svh-72px)] items-center justify-center px-6">
        <div className="max-w-lg border-2 border-foreground bg-card p-8 text-center shadow-[8px_8px_0_var(--foreground)]">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full border-2 border-foreground bg-primary"><Wallet className="size-5" /></span>
          <h1 className="mt-5 text-3xl font-black">Connect before posting.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Your wallet identifies the project owner. Connect with the button in the top-right, then return here.</p>
        </div>
      </div>
    );
  }

  if (created) {
    return (
      <div className="paper-grid flex min-h-[calc(100svh-72px)] items-center justify-center px-6">
        <div className="w-full max-w-xl border-2 border-foreground bg-secondary p-8 shadow-[8px_8px_0_var(--foreground)] sm:p-10">
          <span className="flex size-12 items-center justify-center rounded-full border-2 border-foreground bg-card"><Check className="size-5" /></span>
          <p className="eyebrow mt-8 text-primary">Project posted</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">{created.title}</h1>
          <p className="mt-4 text-sm leading-6">{created.itemCount} items are now available in the worker marketplace.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button nativeButton={false} render={<Link href="/" />}>View marketplace <ArrowRight className="size-4" /></Button>
            <Button variant="outline" onClick={() => setCreated(null)}>Post another</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="paper-grid min-h-[calc(100svh-72px)] px-5 py-14 sm:px-8 lg:px-14 lg:py-20">
      <div className="mx-auto max-w-[1400px]">
        <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div>
            <p className="eyebrow text-primary">Requester studio</p>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-[-0.065em] sm:text-7xl">Post work.<br /><span className="display-serif font-normal italic">Get labels.</span></h1>
            <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">Turn your own text or image URLs into a paid labeling deck. Workers see it in the marketplace immediately.</p>
            <div className="mt-8 border-2 border-foreground bg-secondary p-5 text-sm leading-6 shadow-[4px_4px_0_var(--foreground)]">
              <p className="font-black">Demo funding</p>
              <p className="mt-1 text-muted-foreground">Rewards currently use the Taskmaster testnet treasury, so demo accounts are limited to 3 open projects, 100 active items, and 0.001 SOL per label. You cannot earn from your own project.</p>
            </div>
          </div>

          <form onSubmit={submit} className="border-2 border-foreground bg-card shadow-[8px_8px_0_var(--foreground)]">
            <div className="border-b-2 border-foreground bg-secondary px-5 py-4 sm:px-7">
              <p className="font-black">Project setup</p>
              <p className="mt-1 text-xs text-muted-foreground">Up to 100 items per project</p>
            </div>

            <div className="space-y-7 p-5 sm:p-7">
              <fieldset>
                <legend className="mb-3 text-xs font-bold uppercase tracking-wider">What needs labeling?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    { id: "text" as const, label: "Text items", description: "Reviews, messages, prompts", icon: FileText },
                    { id: "image" as const, label: "Image URLs", description: "Photos hosted online", icon: Image },
                  ]).map(({ id, label, description, icon: Icon }) => (
                    <button key={id} type="button" onClick={() => setType(id)} aria-pressed={type === id} className={`flex items-center gap-3 border-2 p-4 text-left transition ${type === id ? "border-foreground bg-primary shadow-[3px_3px_0_var(--foreground)]" : "border-foreground/30 hover:border-foreground"}`}>
                      <Icon className="size-5" /><span><span className="block text-sm font-black">{label}</span><span className="block text-xs opacity-65">{description}</span></span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider">Project title</span><input required minLength={3} maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={type === "image" ? "Identify products in catalog photos" : "Classify customer feedback"} className="h-12 w-full border-2 border-foreground bg-background px-4 text-sm outline-none focus:bg-secondary/25 focus:ring-2 focus:ring-primary" /></label>

              <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider">Instructions</span><textarea required minLength={10} maxLength={1500} value={guidelines} onChange={(event) => setGuidelines(event.target.value)} rows={4} placeholder="Explain what a good label looks like, including edge cases." className="w-full resize-y border-2 border-foreground bg-background px-4 py-3 text-sm leading-6 outline-none focus:bg-secondary/25 focus:ring-2 focus:ring-primary" /></label>

              <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider">Label options</span><input required value={options} onChange={(event) => setOptions(event.target.value)} placeholder={type === "image" ? "shoe, bag, watch, other" : "positive, neutral, negative"} className="h-12 w-full border-2 border-foreground bg-background px-4 text-sm outline-none focus:bg-secondary/25 focus:ring-2 focus:ring-primary" /><span className="mt-2 block text-xs text-muted-foreground">Separate 2–8 choices with commas.</span></label>

              <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
                <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider">SOL per label</span><input required inputMode="decimal" value={paySol} onChange={(event) => setPaySol(event.target.value)} className="h-12 w-full border-2 border-foreground bg-background px-4 text-sm tabular-nums outline-none focus:bg-secondary/25 focus:ring-2 focus:ring-primary" /></label>
                <div className="border-2 border-foreground/30 bg-muted/40 px-4 py-3"><p className="text-xs text-muted-foreground">Maximum project rewards</p><p className="mt-1 text-xl font-black tabular-nums">{Number.isFinite(maximumBudget) ? maximumBudget.toFixed(4) : "0.0000"} SOL</p></div>
              </div>

              <label className="block"><span className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider"><span>{type === "image" ? "Image URLs" : "Items"}</span><span className="font-normal normal-case tracking-normal text-muted-foreground">{items.length}/100</span></span><textarea required value={rawItems} onChange={(event) => setRawItems(event.target.value)} rows={9} placeholder={type === "image" ? "https://example.com/photo-1.jpg\nhttps://example.com/photo-2.jpg" : "The support team was incredibly helpful.\nMy order arrived three days late."} className="w-full resize-y border-2 border-foreground bg-background px-4 py-3 font-mono text-xs leading-6 outline-none focus:bg-secondary/25 focus:ring-2 focus:ring-primary" /><span className="mt-2 block text-xs text-muted-foreground">One item per line.</span></label>

              <label className="flex cursor-pointer items-center justify-center gap-2 border-2 border-dashed border-foreground/40 px-4 py-3 text-sm font-bold transition hover:border-foreground hover:bg-secondary/30"><Upload className="size-4" />Load a .txt or .csv file<input type="file" accept=".txt,.csv,text/plain,text/csv" className="sr-only" onChange={(event) => void loadFile(event.target.files?.[0])} /></label>

              {error && <p role="alert" className="border-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-foreground bg-background px-5 py-4 sm:px-7">
              <p className="text-xs text-muted-foreground">Publishing makes these items immediately available to workers.</p>
              <Button type="submit" size="lg" disabled={busy || items.length === 0 || labels.length < 2}>{busy ? "Publishing…" : "Publish project"}<ArrowRight className="size-4" /></Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
