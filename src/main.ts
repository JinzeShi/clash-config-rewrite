import fs from 'node:fs';
import path from 'node:path';
import vm, { type Context } from 'node:vm';
import yaml from 'js-yaml';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE_PATH = path.join(PROJECT_ROOT, 'configs', 'config.yaml');
const REWRITE_FILE_PATH = path.join(PROJECT_ROOT, 'configs', 'rewrite.js');

const CONFIG_DEFAULT_ORIGIN_DIR = 'origin';
const CONFIG_DEFAULT_OUTPUT_DIR = 'output';
const CONFIG_DEFAULT_OUTPUT_FILE_SUFFIX = '_Output.yaml';
const CONFIG_DEFAULT_REWRITE_OUTPUT_FILE_SUFFIX = '_Rewrite.yaml';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ProfileConfig {
  name: string;
  originFile: string;
  outputFile: string;
  rewriteOutputFile: string;
}

export interface AppConfig {
  originDir: string;
  outputDir: string;
  profiles: ProfileConfig[];
}

export interface RewriteResult {
  origin: string;
  output: string;
  rewriteOutput: string;
  skipped?: boolean;
}

export interface RawProfileConfig {
  name: string;
  originFile: string;
  outputFile?: string;
  rewriteOutputFile?: string;
}

export interface RawAppConfig {
  originDir: string;
  outputDir: string;
  profiles: RawProfileConfig[];
}

type ParsedConfig = {
  originDir?: unknown;
  outputDir?: unknown;
  profiles?: unknown;
};

type ParsedProfileConfig = {
  name?: unknown;
  originFile?: unknown;
  outputFile?: unknown;
  rewriteOutputFile?: unknown;
};

type RewriteFunction = (config: JsonValue, profileName: string) => JsonValue | Promise<JsonValue>;

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function readYamlFile(filePath: string): JsonValue {
  const content = fs.readFileSync(filePath, 'utf8');

  return toJsonValue(yaml.load(content));
}

export function readRawAppConfig(): RawAppConfig {
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    const defaultConfig = {
      originDir: 'origin',
      outputDir: 'output',
      profiles: [{
        name: 'Example',
        originFile: 'Example.yaml',
        outputFile: 'Example_Output.yaml',
        rewriteOutputFile: 'Example_Rewrite.yaml',
      }],
    };
    fs.mkdirSync(path.dirname(CONFIG_FILE_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_FILE_PATH, yaml.dump(defaultConfig, { lineWidth: -1, noRefs: true }), 'utf8');
  }

  const data = readYamlFile(CONFIG_FILE_PATH);

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('config.yaml must contain an object config.');
  }

  const parsedConfig = data as ParsedConfig;
  const rawProfiles = Array.isArray(parsedConfig.profiles) ? parsedConfig.profiles : [];

  return {
    originDir: typeof parsedConfig.originDir === 'string' ? parsedConfig.originDir : '',
    outputDir: typeof parsedConfig.outputDir === 'string' ? parsedConfig.outputDir : '',
    profiles: rawProfiles.map((profileConfig, index) => readRawProfileConfig(profileConfig, index)),
  };
}

export function readAppConfig(): AppConfig {
  const rawConfig = readRawAppConfig();

  return {
    originDir: rawConfig.originDir || CONFIG_DEFAULT_ORIGIN_DIR,
    outputDir: rawConfig.outputDir || CONFIG_DEFAULT_OUTPUT_DIR,
    profiles: rawConfig.profiles.map((profileConfig, index) => normalizeProfileConfig(profileConfig, index)),
  };
}

export function readRewriteFile(): string {
  if (!fs.existsSync(REWRITE_FILE_PATH)) {
    fs.mkdirSync(path.dirname(REWRITE_FILE_PATH), { recursive: true });
    fs.writeFileSync(REWRITE_FILE_PATH, 'function main(config, profileName) {\n  return config;\n}\n', 'utf8');
  }
  return fs.readFileSync(REWRITE_FILE_PATH, 'utf8');
}

function readRawProfileConfig(profileConfig: unknown, index: number): RawProfileConfig {
  if (!profileConfig || typeof profileConfig !== 'object' || Array.isArray(profileConfig)) {
    throw new TypeError(`config.yaml profiles[${index}] must be an object.`);
  }

  const parsedProfileConfig = profileConfig as ParsedProfileConfig;
  const name = typeof parsedProfileConfig.name === 'string' ? parsedProfileConfig.name.trim() : '';
  const originFile = typeof parsedProfileConfig.originFile === 'string' ? parsedProfileConfig.originFile.trim() : '';
  const outputFile = typeof parsedProfileConfig.outputFile === 'string' ? parsedProfileConfig.outputFile.trim() : '';
  const rewriteOutputFile =
    typeof parsedProfileConfig.rewriteOutputFile === 'string' ? parsedProfileConfig.rewriteOutputFile.trim() : '';

  if (!name || !originFile) {
    throw new TypeError(`config.yaml profiles[${index}] must include name and originFile.`);
  }

  const rawProfile: RawProfileConfig = {
    name,
    originFile,
  };

  if (outputFile) {
    rawProfile.outputFile = outputFile;
  }

  if (rewriteOutputFile) {
    rawProfile.rewriteOutputFile = rewriteOutputFile;
  }

  return rawProfile;
}

function normalizeProfileConfig(profileConfig: RawProfileConfig, index: number): ProfileConfig {
  const outputFile = profileConfig.outputFile || profileConfig.name + CONFIG_DEFAULT_OUTPUT_FILE_SUFFIX;
  const rewriteOutputFile =
    profileConfig.rewriteOutputFile || profileConfig.name + CONFIG_DEFAULT_REWRITE_OUTPUT_FILE_SUFFIX;

  if (!profileConfig.name || !profileConfig.originFile) {
    throw new TypeError(`config.yaml profiles[${index}] must include name and originFile.`);
  }

  return {
    name: profileConfig.name,
    originFile: profileConfig.originFile,
    outputFile,
    rewriteOutputFile,
  };
}

function dumpYamlFile(filePath: string, data: JsonValue): void {
  const yamlContent = yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
  });

  fs.writeFileSync(filePath, yamlContent, 'utf8');
}

function clearDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });

  for (const entryName of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, entryName), {
      recursive: true,
      force: true,
    });
  }
}

function loadRewrite(): RewriteFunction {
  const code = readRewriteFile();
  const sandbox: Context = {
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, {
    filename: REWRITE_FILE_PATH,
  });

  if (typeof sandbox.main !== 'function') {
    throw new TypeError('rewrite.js must define a main(config, profileName) function.');
  }

  return sandbox.main as RewriteFunction;
}

export async function runRewrite(): Promise<RewriteResult[]> {
  const appConfig = readAppConfig();
  const originDir = path.resolve(PROJECT_ROOT, appConfig.originDir);
  const outputDir = path.resolve(PROJECT_ROOT, appConfig.outputDir);
  const rewrite = loadRewrite();
  const results: RewriteResult[] = [];

  clearDirectory(outputDir);

  for (const profileConfig of appConfig.profiles) {
    const profileName = profileConfig.name;
    const originFilePath = path.join(originDir, profileConfig.originFile);
    const outputFilePath = path.join(outputDir, profileConfig.outputFile);
    const rewriteOutputFilePath = path.join(outputDir, profileConfig.rewriteOutputFile);

    if (!fs.existsSync(originFilePath) || fs.statSync(originFilePath).size === 0) {
      results.push({
        origin: originFilePath,
        output: outputFilePath,
        rewriteOutput: rewriteOutputFilePath,
        skipped: true,
      });
      continue;
    }

    const configJson = readYamlFile(originFilePath);
    const rewriteInput = JSON.parse(JSON.stringify(configJson)) as JsonValue;
    const rewriteConfig = await rewrite(rewriteInput, profileName);

    dumpYamlFile(outputFilePath, configJson);
    dumpYamlFile(rewriteOutputFilePath, rewriteConfig);

    results.push({
      origin: originFilePath,
      output: outputFilePath,
      rewriteOutput: rewriteOutputFilePath,
    });
  }

  return results;
}

if (require.main === module) {
  runRewrite().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
