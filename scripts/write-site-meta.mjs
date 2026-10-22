import "dotenv/config";
import { readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("dist/storefront");
let origin = (process.env.SITE_ORIGIN ?? "").trim();
if (origin) {
  const parsed = new URL(origin);
  if (
    (parsed.protocol !== "https:" && parsed.hostname !== "localhost") ||
    parsed.username ||
    parsed.password
  )
    throw new Error(
      "SITE_ORIGIN must use HTTPS (except localhost development) and contain no credentials."
    );
  if (parsed.pathname !== "/" || parsed.search || parsed.hash)
    throw new Error(
      "SITE_ORIGIN must be an origin without a path, query, or fragment."
    );
  origin = parsed.origin;
}
const escape = value =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
await rm(resolve(output, "__manus__"), { recursive: true, force: true });
const indexFile = resolve(output, "index.html");
let html = await readFile(indexFile, "utf8");
if (origin) {
  const tags = [
    `<link rel="canonical" href="${escape(origin)}/" />`,
    `<meta property="og:url" content="${escape(origin)}/" />`,
    `<meta property="og:image" content="${escape(origin)}/images/foodie-friend-hero.webp" />`,
    `<meta property="og:image:alt" content="Illustrative Nigerian-inspired food photography; menu presentation may vary." />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n    ");
  html = html.replace("</head>", `    ${tags}\n  </head>`);
  await writeFile(
    resolve(output, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(origin)}/</loc></url></urlset>\n`,
    "utf8"
  );
} else {
  await rm(resolve(output, "sitemap.xml"), { force: true });
  console.warn(
    "SITE_ORIGIN is unset; canonical and sitemap URLs will be omitted until the real domain is configured."
  );
}
await writeFile(indexFile, html, "utf8");
await writeFile(
  resolve(output, "robots.txt"),
  `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ""}`,
  "utf8"
);
console.log(
  origin
    ? `Wrote SEO metadata for ${origin}.`
    : "Wrote a safe robots.txt without a guessed domain."
);
