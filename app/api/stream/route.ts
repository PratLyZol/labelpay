import { bus, type BusEvent } from "@/lib/sse/bus";
import { requireWallet } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "me"; // "me" | "all"
  const wallet = await requireWallet();
  if (scope === "me" && !wallet) return new Response("not signed in", { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let ping: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (ev: BusEvent | { type: "hello" | "ping"; at: number }) => {
        try {
          controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
        } catch {
          /* closed */
        }
      };
      send({ type: "hello", at: Date.now() });
      unsubscribe = bus.subscribe((ev) => {
        if (scope === "all" || ev.worker === wallet) send(ev);
      });
      ping = setInterval(() => send({ type: "ping", at: Date.now() }), 15_000);
    },
    cancel() {
      unsubscribe();
      clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
