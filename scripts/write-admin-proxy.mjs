import "dotenv/config";
import { mkdir, copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("dist/admin");
await mkdir(output, { recursive: true });
const entry = resolve(output, "admin.html");
const index = resolve(output, "index.html");
await copyFile(entry, index);
await rm(entry, { force: true });
let apiOrigin = (process.env.API_SITE_ORIGIN ?? "").trim();
if (!apiOrigin)
  throw new Error(
    "API_SITE_ORIGIN is required; refusing to publish an admin site with a placeholder API proxy."
  );
{
  const parsed = new URL(apiOrigin);
  if (
    (parsed.protocol !== "https:" && parsed.hostname !== "localhost") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      "API_SITE_ORIGIN must be a clean HTTPS origin (except localhost development)."
    );
  apiOrigin = parsed.origin;
}
await rm(resolve(output, "__manus__"), { recursive: true, force: true });
await rm(resolve(output, "images"), { recursive: true, force: true });
await writeFile(
  index,
  (await readFile(index, "utf8")).replaceAll(
    'href="/"',
    `href=\"${apiOrigin}\"`
  ),
  "utf8"
);
await writeFile(
  resolve(output, "_redirects"),
  `/api/*  ${apiOrigin}/api/:splat  200!\n`,
  "utf8"
);
await writeFile(
  resolve(output, "robots.txt"),
  "User-agent: *\nDisallow: /\n",
  "utf8"
);
console.log(
  `Prepared the separate admin site and its same-origin API proxy to ${apiOrigin}.`
);
