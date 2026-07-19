import { AppConfig, AppConfigSchema } from "../model/config";
import { CoreError } from "../errors/core-error";
import { readAppConfig } from "./repository";

let appConfig: AppConfig;

const BLACKLIST_DIR = new Set<string>([
  ".git",
  "node_modules",
  "src",
  "dist",
  "configs",
  "public",
  "docs",
]);

export async function initAppConfig(): Promise<void> {
  const date = await readAppConfig();
  const appConfigTmp = AppConfigSchema.parse(date);
  checkAppConfig(appConfigTmp);
  appConfig = appConfigTmp;
}

export function getOriginDir(): string {
  return appConfig.originDir;
}

export function getOutputDir(): string {
  return appConfig.outputDir;
}

export function getHost(): string {
  return appConfig.host;
}

export function getPort(): number {
  return appConfig.port;
}

function checkAppConfig(config: AppConfig): void {
  if (config.originDir === config.outputDir) {
    throw new CoreError("originDir and outputDir cannot be the same");
  }

  if (BLACKLIST_DIR.has(config.originDir) || BLACKLIST_DIR.has(config.outputDir)) {
    throw new CoreError(`originDir and outputDir cannot be ${[...BLACKLIST_DIR].join(", ")}`);
  }
}