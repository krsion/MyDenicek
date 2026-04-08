import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "https://krsion.github.io/mydenicek/";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
  ],
});
