import fs from "node:fs/promises";
import path from "node:path";

const relativeTargets = [
  "node_modules/next/dist/build/swc/index.js",
  "node_modules/next/dist/esm/build/swc/index.js",
];

const needle = "if (version && version !== nextVersion) {";
const replacement =
  "if (process.env.NEXT_ENABLE_SWC_VERSION_WARNING === '1' && version && version !== nextVersion) {";

let patchedAny = false;

for (const rel of relativeTargets) {
  const filePath = path.join(process.cwd(), rel);
  try {
    const before = await fs.readFile(filePath, "utf8");
    if (!before.includes(needle)) continue;
    const after = before.split(needle).join(replacement);
    if (after === before) continue;
    await fs.writeFile(filePath, after, "utf8");
    patchedAny = true;
  } catch {
    continue;
  }
}

if (patchedAny) {
  console.log(
    "Patched Next.js SWC version warning (set NEXT_ENABLE_SWC_VERSION_WARNING=1 to re-enable).",
  );
}

