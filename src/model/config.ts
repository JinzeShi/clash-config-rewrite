import { z } from "zod";

export const AppConfigSchema = z.object({
  originDir: z.string().default('origin'),
  outputDir: z.string().default('output'),
  host: z.string().default('0.0.0.0'),
  port: z.int().min(1).max(65535).default(13000),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;