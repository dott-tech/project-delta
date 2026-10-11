import "dotenv/config";
import { defineConfig, env } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Prisma CLI migrations use the direct, non-pooled connection when configured.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});
