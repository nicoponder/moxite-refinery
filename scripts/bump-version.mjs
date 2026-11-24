import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [bump, ...extra] = process.argv.slice(2);
if (!["major", "minor", "patch"].includes(bump) || extra.length) {
  console.error("Usage: npm run bump -- <major|minor|patch>");
  process.exit(1);
}

const root = new URL("../", import.meta.url);
const manifestFile = new URL("public/manifest.json", root);
const packageVersion = () =>
  JSON.parse(readFileSync(new URL("package.json", root), "utf8")).version;
const manifest = readFileSync(manifestFile, "utf8");
const current = packageVersion();
if (JSON.parse(manifest).version !== current) {
  console.error("package.json and public/manifest.json must have the same version before bumping.");
  process.exit(1);
}

// Let npm calculate the version and keep package-lock.json in sync without tagging or committing.
execFileSync("npm", ["version", bump, "--no-git-tag-version", "--ignore-scripts"], { cwd: root });
const next = packageVersion();
// Change only the version field, preserving the manifest's formatting.
writeFileSync(manifestFile, manifest.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${next}"`));

console.log(`Version bumped: ${current} → ${next}`);
console.log("Commit the version changes, then run this to trigger the AMO publish:");
console.log(`git tag v${next} && git push origin v${next}`);
