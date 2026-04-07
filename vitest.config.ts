import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["plugins/__tests__/**/*.test.ts"],
  },
})
