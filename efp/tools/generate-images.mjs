// Genera las fotos de la landing a partir de tools/prompts.json y las guarda en efp/img/.
//
// Uso:
//   GEMINI_API_KEY=... node efp/tools/generate-images.mjs              (Google Imagen, por defecto)
//   OPENAI_API_KEY=... node efp/tools/generate-images.mjs --openai     (gpt-image-1)
//   XAI_API_KEY=...    node efp/tools/generate-images.mjs --xai        (Grok)
// Se puede limitar a algunos archivos:  node efp/tools/generate-images.mjs hero.jpg vasos.jpg
// El modelo se cambia con IMAGE_MODEL=...
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "img");
const args = process.argv.slice(2);
const provider = args.includes("--openai") ? "openai" : args.includes("--xai") ? "xai" : "google";
const only = args.filter((a) => !a.startsWith("--"));

const need = (name) => {
  const v = process.env[name];
  if (!v) { console.error(`Falta la variable ${name}.`); process.exit(1); }
  return v;
};

const postJson = async (url, headers, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
};

const PROVIDERS = {
  google: async (prompt, ratio) => {
    const model = process.env.IMAGE_MODEL || "imagen-4.0-generate-001";
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`,
      { "x-goog-api-key": need("GEMINI_API_KEY") },
      { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: ratio } },
    );
    return data.predictions[0].bytesBase64Encoded;
  },
  openai: async (prompt, ratio) => {
    const data = await postJson(
      "https://api.openai.com/v1/images/generations",
      { Authorization: `Bearer ${need("OPENAI_API_KEY")}` },
      {
        model: process.env.IMAGE_MODEL || "gpt-image-1",
        prompt,
        size: ratio === "1:1" ? "1024x1024" : "1536x1024",
        quality: "high",
        output_format: "jpeg",
      },
    );
    return data.data[0].b64_json;
  },
  xai: async (prompt) => {
    const data = await postJson(
      "https://api.x.ai/v1/images/generations",
      { Authorization: `Bearer ${need("XAI_API_KEY")}` },
      { model: process.env.IMAGE_MODEL || "grok-2-image", prompt, response_format: "b64_json" },
    );
    return data.data[0].b64_json;
  },
};

const { _style: style, images } = JSON.parse(await readFile(join(here, "prompts.json"), "utf8"));
const jobs = only.length ? images.filter((i) => only.includes(i.file)) : images;
console.log(`Proveedor: ${provider} · ${jobs.length} imágenes`);

for (const img of jobs) {
  process.stdout.write(`→ ${img.file} … `);
  try {
    const b64 = await PROVIDERS[provider](`${img.prompt}. ${style}`, img.aspect_ratio);
    await writeFile(join(outDir, img.file), Buffer.from(b64, "base64"));
    console.log("ok");
  } catch (err) {
    console.log(`error: ${err.message}`);
  }
}
