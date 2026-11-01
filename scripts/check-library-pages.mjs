import { readFileSync } from "node:fs";

const pages = [
  "bibliotheque.html",
  "ma-bibliotheque.html",
  "admin-bibliotheque.html",
  "verification-professionnels.html",
];
let failed = false;
for (const page of pages) {
  const html = readFileSync(page, "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim());
  let pageFailed = false;
  for (let i = 0; i < scripts.length; i += 1) {
    try {
      new Function(scripts[i]);
    } catch (error) {
      failed = true;
      pageFailed = true;
      console.error(\`\${page} — script \${i + 1}: \${error.message}\`);
    }
  }
  if (!scripts.length) {
    failed = true;
    console.error(\`\${page} — aucun script inline détecté\`);
  } else if (!pageFailed) {
    console.log(\`\${page}: \${scripts.length} script(s) vérifié(s)\`);
  }
}
if (failed) process.exit(1);
