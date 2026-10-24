import "dotenv/config";
import { readFileSync } from "node:fs";
import { judgeJson } from "../lib/judge/gemini";
import { buildMonitorMessages, MONITOR_SCHEMA, type MonitorVerdict } from "../lib/judge/prompts";

async function main() {
  const text = await judgeJson<MonitorVerdict>({
    schemaName: "monitor_verdict",
    schema: MONITOR_SCHEMA,
    messages: buildMonitorMessages({
      type: "text", title: "Sentiment", guidelines: "Choose the overall sentiment.",
      options: ["positive", "negative"], payload: { text: "I love this product." },
      answer: "positive", gold: null,
    }),
  });
  console.log("TEXT", text.model, text.ms + "ms", text.data);

  const image = readFileSync("public/img/cat-1.jpg");
  const vision = await judgeJson<MonitorVerdict>({
    schemaName: "monitor_verdict",
    schema: MONITOR_SCHEMA,
    messages: buildMonitorMessages({
      type: "image", title: "Main subject", guidelines: "Choose the main subject.",
      options: ["cat", "dog"], payload: { src: "/img/cat-1.jpg" },
      answer: "dog", gold: null,
      imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
    }),
  });
  console.log("VISION", vision.model, vision.ms + "ms", vision.data);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
