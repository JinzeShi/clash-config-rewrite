import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { FileNotFoundError } from "../errors/file-not-found-error";

const PROJECT_ROOT = path.resolve(__dirname, "../../");
const APP_CONFIG_PATH = path.join(PROJECT_ROOT, "configs", "app.yaml");
const PROFILES_CONFIG_PATH = path.join(PROJECT_ROOT, "configs", "profiles.yaml");
const REWRITE_FILE_PATH = path.join(PROJECT_ROOT, "configs", "rewrite.js");

const DEFAULT_APP_CONFIG_YAML = {
	"originDir": "origin",
	"outputDir": "output",
	"host": "0.0.0.0",
	"port": 13000
};
const DEFAULT_PROFILES_CONFIG_YAML = [
	{
		"name": "Example",
		"originFile": "Example.yaml"
	}
]
const DEFAULT_REWRITE_JS =
  "function main(config, profileName) {\n  return config;\n}\n";

export async function initRepository(): Promise<void> {
  await Promise.all([
    initYaml(APP_CONFIG_PATH, DEFAULT_APP_CONFIG_YAML),
    initYaml(PROFILES_CONFIG_PATH, DEFAULT_PROFILES_CONFIG_YAML),
    initFile(REWRITE_FILE_PATH, DEFAULT_REWRITE_JS),
  ]);
}

async function initFile(path: string, defaultContent: string): Promise<void> {
	if (!(await fs_fileExists(path))) {
    await fs_writeFile(path, defaultContent);
  }
}

async function initYaml(path: string, defaultContent: any): Promise<void> {
  if (!(await fs_fileExists(path))) {
    await fs_writeYaml(path, defaultContent);
  }
}

export async function readAppConfig(): Promise<any> {
	return await fs_readYaml(APP_CONFIG_PATH);
}

export async function readProfileConfig(): Promise<any> {
	return await fs_readYaml(PROFILES_CONFIG_PATH);
}

export async function readRewriteJs(): Promise<string> {
	return await fs_readFile(REWRITE_FILE_PATH);
}

export async function writeProfileConfig(content: any): Promise<void> {
	await fs_writeYaml(PROFILES_CONFIG_PATH, content);
}

export async function writeRewriteJs(content: string): Promise<void> {
	await fs_writeFile(REWRITE_FILE_PATH, content);
}

export async function readFile(relativePath: string): Promise<string> {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  return await fs_readFile(fullPath);
}

export async function readYaml(relativePath: string): Promise<any> {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  return await fs_readYaml(fullPath);
}

export async function writeFile(relativePath: string, content: string): Promise<void> {
  await fs_writeFile(path.join(PROJECT_ROOT, relativePath), content);
}

export async function writeYaml(relativePath: string, content: any): Promise<void> {
  await fs_writeYaml(path.join(PROJECT_ROOT, relativePath), content);
}

export async function clearOutputDirectory(outputDir: string): Promise<void> {
  await fs_clearDirectory(path.join(PROJECT_ROOT, outputDir));
}

export function getRewriteFilePath(): string {
	return REWRITE_FILE_PATH;
}

async function fs_fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function fs_readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (isFileNotFoundError(err)) {
      throw new FileNotFoundError(`File not found: ${filePath}`);
    }
    throw err;
  }
}

async function fs_writeFile(filePath: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data, "utf8");
}

async function fs_clearDirectory(dirPath: string): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath);
    if (entries.length === 0) return;

    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(dirPath, entry), {
          recursive: true,
          force: true,
        }),
      ),
    );
  } catch (err) {
    if (isFileNotFoundError(err)) return;
    throw err;
  }
}

async function fs_readYaml(filePath: string): Promise<any> {
  return yaml.load(await fs_readFile(filePath));
}

async function fs_writeYaml(filePath: string, data: any): Promise<void> {
  await fs_writeFile(
    filePath,
    yaml.dump(data, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    }),
  );
}

function isFileNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object"
    && err !== null
    && "code" in err
    && err.code === "ENOENT"
  );
}