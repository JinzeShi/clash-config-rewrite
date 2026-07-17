import path from "path";
import yaml from "js-yaml";
import { z } from "zod";
import { ProfileInfo, ProfileTypeEnum, RawProfileConfig, RawProfileConfigSchema, SubscriptionUserInfoSchema } from "../model/profile";
import { readFile, readProfileConfig, writeFile, writeProfileConfig } from "./repository";
import { CoreError } from "../errors/core-error";
import { getOriginDir, getOutputDir } from "./config";
import { logger } from "./logger";
import { FileNotFoundError } from "../errors/file-not-found-error";
import { rewriteProfile } from "./rewrite";

const fetching = new Map<string, Promise<any>>();
let profileMap = new Map<string, Map<ProfileTypeEnum, ProfileInfo>>();
let profileNameMap = new Map<string, ProfileInfo>();

let rawProfileConfigList: RawProfileConfig[];

export async function initProfileConfig(): Promise<void> {
  const rawProfileConfigListTmp = z.array(RawProfileConfigSchema).parse(await readProfileConfig());
  checkProfileConfigs(rawProfileConfigListTmp);
  rawProfileConfigList = rawProfileConfigListTmp;
  reloadProfileConfigs();
}

export function getRawProfileConfigs(): RawProfileConfig[] {
  return structuredClone(rawProfileConfigList);
}

export async function replaceRawProfileConfigs(newRawProfileConfigList: RawProfileConfig[]): Promise<void> {
  checkProfileConfigs(newRawProfileConfigList);
  await writeProfileConfig(newRawProfileConfigList);
  rawProfileConfigList = newRawProfileConfigList;
  reloadProfileConfigs();
}

export function getProfileInfo(name: string, type: ProfileTypeEnum): ProfileInfo | undefined {
  return profileMap.get(name)?.get(type);
}

export async function getProfileInfoContent(name: string, type: ProfileTypeEnum): Promise<{ info: ProfileInfo; content: string; }> {
  const profileInfo = profileMap.get(name)?.get(type);
  if (!profileInfo) {
    throw new CoreError(`Profile not found for name: ${name}, type: ${type}`);
  }
  const dir = type === ProfileTypeEnum.ORIGIN ? getOriginDir() : getOutputDir();
  const relativePath = path.join(dir, profileInfo.sourceFileName);

  return { info: profileInfo, content: await readProfileContentFile(relativePath) };
}

export async function getProfileInfoByOutputFileName(outputFileName: string): Promise<{ info: ProfileInfo; content: string; }> {
  const profileInfo = profileNameMap.get(outputFileName);
  if (!profileInfo) {
    throw new CoreError(`Profile not found for output file name: ${outputFileName}`);
  }

  const subscriptionInfo = profileInfo.subscriptionInfo;
  if (subscriptionInfo && subscriptionInfo.updateInterval > 0 && Date.now() - subscriptionInfo.updateTime > subscriptionInfo.updateInterval * 1000) {
    try {
      await fetchAndRewriteProfile(profileInfo);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to fetch and rewrite profile "${profileInfo.name}": ${msg}`);
    }
  }

  const dir = getOutputDir();
  const relativePath = path.join(dir, profileInfo.sourceFileName);

  return { info: profileInfo, content: await readProfileContentFile(relativePath) };
}

export async function updateProfileContent(name: string, content: string): Promise<void> {
  const profileInfoMap = profileMap.get(name);
  if (!profileInfoMap) {
    throw new CoreError(`Profile not found for name: ${name}`);
  }
  
  const originProfileInfo = profileInfoMap.get(ProfileTypeEnum.ORIGIN)!;
  const originFilePath = path.join(getOriginDir(), originProfileInfo.sourceFileName);
  checkProfileContent(content);
  await writeFile(originFilePath, content);
}

export async function readProfileContent(path: string): Promise<any> {
  const content = await readProfileContentFile(path);
  return checkProfileContent(content);
}

export function getProfileInfoByName(name: string): { origin: ProfileInfo; output: ProfileInfo; rewrite: ProfileInfo; } {
  const profileInfoMap = profileMap.get(name);
  if (!profileInfoMap) {
    throw new CoreError(`Profile not found for name: ${name}`);
  }
  return {
    origin: profileInfoMap.get(ProfileTypeEnum.ORIGIN)!,
    output: profileInfoMap.get(ProfileTypeEnum.OUTPUT)!,
    rewrite: profileInfoMap.get(ProfileTypeEnum.REWRITE)!,
  };
}

export function getAllProfileName(): string[] {
  return Array.from(profileMap.keys());
}

export function getDefaultFileName(name: string, type: ProfileTypeEnum): string {
  switch (type) {
    case ProfileTypeEnum.ORIGIN:
      return toCapitalizeCase(name) + ".yaml";
    case ProfileTypeEnum.OUTPUT:
      return toCapitalizeCase(name) + "_Output.yaml";
    case ProfileTypeEnum.REWRITE:
      return toCapitalizeCase(name) + "_Rewrite.yaml";
    default:
      throw new CoreError(`Unhandled profile type: ${type}`);
  }
}

export async function fetchAndRewriteProfile(profileInfo: ProfileInfo): Promise<void> {
  if (!profileInfo) {
    throw new CoreError(`Profile info is required`);
  }

  if (fetching.has(profileInfo.name)) {
    await fetching.get(profileInfo.name);
    return;
  }

  const fetchPromise = (
    async () => {
      await fetchProrile(profileInfo);
      await rewriteProfile(profileInfo.name);
    })().finally(() => {
      fetching.delete(profileInfo.name);
    }
  );

  fetching.set(profileInfo.name, fetchPromise);

  await fetchPromise;
}

async function fetchProrile(profileInfo: ProfileInfo): Promise<void> {
  const name = profileInfo.name;
  const subscriptionInfo = profileInfo.subscriptionInfo;
  if (!subscriptionInfo) {
    throw new CoreError(`Profile "${name}" does not have subscription info`);
  }
  const url = subscriptionInfo.url;
  if (!url) {
    throw new CoreError(`Profile "${name}" does not have a URL to fetch`);
  }

  logger.info(`Fetching profile "${name}" from URL: ${url}`);

  const headers: Record<string, string> = {};
  if (subscriptionInfo.userAgent) {
    headers['User-Agent'] = subscriptionInfo.userAgent;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new CoreError(`Request to fetch profile "${name}" from URL: ${url} timed out`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new CoreError(`Failed to fetch profile "${name}" from URL: ${url}, status: ${response.status}`);
  }

  logger.info(`Successfully fetched profile "${name}", starting to write content to file and updating subscription info`);

  const content = await response.text();
  await updateProfileContent(name, content);

  const rawUserInfo = response.headers.get('subscription-userinfo');
  if (rawUserInfo) {
    try {
      const parts: Record<string, string> = {};
      for (const part of rawUserInfo.split(';')) {
        const [key, val] = part.trim().split('=');
        if (key && val) {
          parts[key.trim()] = val.trim();
        }
      }
      const userInfo = SubscriptionUserInfoSchema.parse({
        upload: Number(parts["upload"]),
        download: Number(parts["download"]),
        total: Number(parts["total"]),
        expire: Number(parts["expire"]),
      });
    
      const raw = getRawProfileConfigs();
      const index = raw.findIndex((p) => p.name === name);
      if (index === -1) {
        throw new CoreError(`Profile not found for name: ${name}`);
      }
      raw[index]!.updateTime = Date.now();
      raw[index]!.subscriptionUserInfo = userInfo;
      
      await replaceRawProfileConfigs(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to parse subscription-userinfo for profile "${name}": ${msg}`);
    }
  }
}

function reloadProfileConfigs(): void {
  const profileMapTmp = new Map<string, Map<ProfileTypeEnum, ProfileInfo>>();
  const profileNameMapTmp = new Map<string, ProfileInfo>();

  for (const raw of rawProfileConfigList) {
    const profileInfoMapTmp = new Map<ProfileTypeEnum, ProfileInfo>();
    const subscriptionInfo = raw.url ? {
      url: raw.url,
      ...(raw.userAgent ? { userAgent: raw.userAgent } : {}),
      updateInterval: raw.updateInterval ?? 0,
      updateTime: raw.updateTime ?? 0,
      ...(raw.subscriptionUserInfo
        ? { userInfo: raw.subscriptionUserInfo }
        : {}),
    } : null;

    for (const type of [ProfileTypeEnum.ORIGIN, ProfileTypeEnum.OUTPUT, ProfileTypeEnum.REWRITE]) {
      const fileName = getDefaultFileName(raw.name, type);
      
      const profileInfo: ProfileInfo = {
        name: raw.name,
        type,
        sourceFileName:
          type === ProfileTypeEnum.ORIGIN
            ? raw.originFile
            : type === ProfileTypeEnum.OUTPUT
              ? (raw.outputFile ?? fileName)
              : (raw.rewriteOutputFile ?? fileName),
        downloadFileName: fileName,
        ...(subscriptionInfo ? { subscriptionInfo } : {}),
      };
      profileInfoMapTmp.set(profileInfo.type, profileInfo);
      if (profileInfo.type !== ProfileTypeEnum.ORIGIN) {
        profileNameMapTmp.set(profileInfo.sourceFileName, profileInfo);
      }
    }
    profileMapTmp.set(raw.name, profileInfoMapTmp);
  }

  profileMap = profileMapTmp;
  profileNameMap = profileNameMapTmp;
}

async function readProfileContentFile(path: string): Promise<string> {
  try {
    return await readFile(path);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      logger.info(`Profile file not found: ${path}`);
      return "";
    }
    
    throw new CoreError(`Error reading profile file: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function checkProfileConfigs(raw: RawProfileConfig[]): void {
  const profileNameSet = new Set<string>();
  const originNameSet = new Set<string>();
  const outputNameSet = new Set<string>();
  
  for (const profile of raw) {
    if (!profile.name || !profile.originFile) {
      throw new CoreError(`Profile must have a name and an origin file: ${JSON.stringify(profile)}`);
    }

    if (profileNameSet.has(profile.name)) {
      throw new CoreError(`Duplicate profile name: ${profile.name}`);
    }
    profileNameSet.add(profile.name);

    const originFileName = profile.originFile;
    if (originNameSet.has(originFileName)) {
      throw new CoreError(`Duplicate origin file name: ${originFileName}`);
    }
    originNameSet.add(originFileName);

    const outputFileName = profile.outputFile ?? getDefaultFileName(profile.name, ProfileTypeEnum.OUTPUT);
    if (outputNameSet.has(outputFileName)) {
      throw new CoreError(`Duplicate output file name: ${outputFileName}`);
    }
    outputNameSet.add(outputFileName);

    const rewriteOutputFileName = profile.rewriteOutputFile ?? getDefaultFileName(profile.name, ProfileTypeEnum.REWRITE);
    if (outputNameSet.has(rewriteOutputFileName)) {
      throw new CoreError(`Duplicate rewrite output file name: ${rewriteOutputFileName}`);
    }
    outputNameSet.add(rewriteOutputFileName);
  }
}

function checkProfileContent(content: string): any {
  try {
    const parsed = yaml.load(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new CoreError('Profile content must be a valid YAML object');
    }
    return parsed;
  } catch (error) {
    throw new CoreError(`Invalid profile content: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function toCapitalizeCase(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
