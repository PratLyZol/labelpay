import "dotenv/config";
import { cortexJson } from "../lib/judge/cortex";
import { buildMonitorMessages as buildJudgeMessages, MONITOR_SCHEMA as VERDICT_SCHEMA, type MonitorVerdict as JudgeVerdict } from "../lib/judge/prompts";
import { readFileSync } from "node:fs";

async function main() {
  const t0 = Date.now();
  const text = await cortexJson<JudgeVerdict>({
    schemaName: "label_verdict",
    schema: VERDICT_SCHEMA,
    messages: buildJudgeMessages({
      type: "text",
      title: "Product review sentiment",
      guidelines: "Choose the overall sentiment.",
      options: ["positive", "negative", "neutral", "mixed"],
      payload: { text: "Oh great, another charger that dies in three weeks. Exactly what I wanted." },
      answer: "positive",
      gold: "negative",
    }),
  });
  console.log("TEXT  ", text.ms + "ms", text.model, JSON.stringify(text.data));

  try {
    const img = readFileSync("public/img/cat-1.jpg");
    const vision = await cortexJson<JudgeVerdict>({
      schemaName: "label_verdict",
      schema: VERDICT_SCHEMA,
      messages: buildJudgeMessages({
        type: "image",
        title: "Main subject",
        guidelines: "Choose the main subject.",
        options: ["cat", "dog", "bird", "car", "bicycle", "airplane"],
        payload: { src: "/img/cat-1.jpg" },
        answer: "dog",
        gold: null,
        imageDataUrl: `data:image/jpeg;base64,${img.toString("base64")}`,
      }),
    });
    console.log("VISION", vision.ms + "ms", vision.model, JSON.stringify(vision.data));
  } catch (e) {
    console.log("VISION unsupported or failed:", (e as Error).message.slice(0, 300));
  }
  console.log("total", Date.now() - t0, "ms");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
