import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // No test touches the network: chain lookups are off unless a test installs a fake node.
    env: { ZECCLAIM_CHAIN_CHECKS: "off" },
    // zecclaimUI/ is a temporary design-reference project, not part of ZecClaim.
    exclude: [...configDefaults.exclude, "zecclaimUI/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
