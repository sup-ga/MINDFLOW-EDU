import { readFileSync } from "node:fs";
import vm from "node:vm";

const pages = [
  "tableau-de-bord-professionnel.html",
  "integration-classes.html",
  "espace-apprenant.html",
  "paiement.html",
];

let failures = 0;
for (const path of pages) {
  const html = readFileSync(path, "utf8");
  const opened = (html.match(/<script\\b/gi) || []).length;
  const closed = (html.match(/<\\/script>/gi) || []).length;
  if (opened !== closed) {
    console.error(`FAIL ${path}: ${opened} script tags but ${closed} closing tags`);
    failures++;
    continue;
  }
  const pattern = /<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi;
  let match;
  let inlineIndex = 0;
  while ((match = pattern.exec(html))) {
    if (/\\bsrc\\s*=/.test(match[1])) continue;
    const source = match[2].trim();
    if (!source) continue;
    inlineIndex++;
    try {
      new vm.Script(source, { filename: `${path}#inline-${inlineIndex}` });
    } catch (error) {
      console.error(`FAIL ${path} inline script ${inlineIndex}: ${error.message}`);
      failures++;
    }
  }
  console.log(`CHECKED ${path}: ${inlineIndex} inline script(s)`);
}
if (failures) process.exit(1);
console.log("All MindFlow offer and learner payment scripts passed syntax checks.");
