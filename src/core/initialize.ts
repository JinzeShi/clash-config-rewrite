import { initAppConfig } from "./config";
import { initProfileConfig } from "./profile";
import { initRepository } from "./repository";
import { initRewriteJs } from "./rewrite";

export async function initialize(): Promise<void> {
  await initRepository();
  await Promise.all([
    initAppConfig(),
    initProfileConfig(),
    initRewriteJs()
  ]);
}