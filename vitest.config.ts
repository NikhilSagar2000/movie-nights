import { defineConfig } from "vitest/config";

// Separate from vite.config.ts so tests run in plain Node, without the Workers runtime plugin.
export default defineConfig({ test: { include: ["src/**/*.test.ts", "worker/**/*.test.ts", "shared/**/*.test.ts"] } });
