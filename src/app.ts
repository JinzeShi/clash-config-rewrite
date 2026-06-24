import { getHost, getPort } from "./core/config";
import { initialize } from "./core/initialize";
import { buildApp } from "./router";

async function start() {
  await initialize().catch((err) => {
    console.error("Failed to initialize the application:", err);
    process.exit(1);
  });

  const app = buildApp();

  await app.listen({
    host: getHost() || '0.0.0.0',
    port: getPort() || 13000,
  });
}

start();