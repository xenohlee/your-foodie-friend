import "dotenv/config";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
process.env.BUILD_TARGET = "storefront";
const server = await createServer({
  configFile: resolve(root, "vite.config.ts"),
  mode: "production",
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { default: App } = await server.ssrLoadModule("/src/App.tsx");
  const markup = renderToString(createElement(App));
  const file = resolve(root, "dist/storefront/index.html");
  const source = await readFile(file, "utf8");
  if (!source.includes('<div id="root"></div>'))
    throw new Error("Expected the Vite storefront root element was not found.");
  await writeFile(
    file,
    source.replace('<div id="root"></div>', `<div id="root">${markup}</div>`),
    "utf8"
  );
  console.log("Pre-rendered the storefront HTML.");
} finally {
  await server.close();
}
