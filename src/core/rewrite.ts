import vm from "node:vm";
import { getRewriteFilePath, readRewriteJs, writeRewriteJs, writeYaml } from "./repository";
import { CoreError } from "../errors/core-error";
import { getAllProfileName, getProfileInfoByName, readProfileContent } from "./profile";
import path from "node:path";
import { getOriginDir, getOutputDir } from "./config";
import { logger } from "./logger";

type RewriteFunction = (
  config: any,
  profileName: string,
) => any | Promise<any>;

let rewriteJs: string;
let rewriteFunction: RewriteFunction;

export async function initRewriteJs(): Promise<void> {
  rewriteJs = await readRewriteJs();
  rewriteFunction = getRewriteFunctionFromCode(rewriteJs);
}

export function getRewriteJs(): string {
  return rewriteJs;
}

export async function replaceRewriteJs(content: string): Promise<void> {
  const rewriteFunctionTmp = getRewriteFunctionFromCode(content);
  await writeRewriteJs(content);
  rewriteJs = content;
  rewriteFunction = rewriteFunctionTmp;
}

export async function rewriteProfileAll(): Promise<{ total: number; fail: number; msg: string }> {
  const profiles = getAllProfileName();
  const results = await Promise.allSettled(
    profiles.map(async (profile) => 
      await rewriteProfile(profile).catch((err) => {
        return Promise.reject(err instanceof Error ? err.message : String(err));
      })
  ));

  let fail = 0;
  let msgList: string[] = [];

  for (const [i, result] of results.entries()) {
    const profile = profiles[i];

    if (result.status === "rejected") {
      logger.warn(`Error processing profile "${profile}": ${result.reason}`);
      msgList.push(`Profile "${profile}" rewrite failed: ${result.reason}`);
      fail++;
    }
  }
  const msg = msgList.length > 0 ? msgList.join("; ") : "All profiles rewritten successfully";
  return { total: profiles.length, fail, msg };
}

export async function rewriteProfile(name: string): Promise<void> {
  logger.info(`Rewriting profile "${name}"`);

  const { origin, output, rewrite } = getProfileInfoByName(name);

  const originFilePath = path.join(getOriginDir(), origin.sourceFileName);
  const outputFilePath = path.join(getOutputDir(), output.sourceFileName);
  const rewriteOutputFilePath = path.join(getOutputDir(), rewrite.sourceFileName);

  const outputContent = await readProfileContent(originFilePath);
  const rewriteContent = await rewriteFunction(structuredClone(outputContent), name);

  await Promise.all([
    writeYaml(outputFilePath, outputContent),
    writeYaml(rewriteOutputFilePath, rewriteContent)
  ]);

  logger.info(`Successfully rewritten profile "${name}" to output files"`);
}

function getRewriteFunctionFromCode(code: string): RewriteFunction {
  const sandbox = createSandbox();

  try {
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, {
      filename: getRewriteFilePath(),
      timeout: 1000,
      breakOnSigint: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new CoreError(`Error evaluating rewrite.js: ${msg}`);
  }

  const main = sandbox.main;
  if (typeof main !== "function") {
    throw new CoreError(
      "rewrite.js must export a function named main(config, profileName)",
    );
  }

  const safeMain: RewriteFunction = async (config, name) => {
    try {
      const result = await main(config, name);
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new CoreError("Rewrite function must return a valid YAML object");
      }
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new CoreError(
        `Error in rewrite function: ${msg}`,
      );
    }
  };

  return safeMain;
}

function createSandbox(): any {
  const sandbox: any = {
    console,
    require: undefined,
    global: undefined,
  };

  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;

  return sandbox;
}