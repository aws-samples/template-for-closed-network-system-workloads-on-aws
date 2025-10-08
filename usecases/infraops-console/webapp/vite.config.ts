import { vitePlugin as remix } from "@remix-run/dev";
import path from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

declare module "@remix-run/node" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/*.css"],
      future: {
        v3_singleFetch: true,
      },
    }), 
    tsconfigPaths()
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app")
    }
  }
});