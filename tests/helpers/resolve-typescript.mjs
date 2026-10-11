import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Node's TypeScript runner needs the path resolution that Next's bundler supplies.
const root = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`${specifier.slice(2)}.ts`, root);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts") && !specifier.endsWith(".ts")) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
