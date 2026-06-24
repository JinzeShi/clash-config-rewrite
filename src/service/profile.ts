import { getProfileInfo, getProfileInfoByOutputFileName, getProfileInfoContent, getRawProfileConfigs, replaceRawProfileConfigs, updateProfileContent } from "../core/profile";
import { GetProfileContentResponseDTO, GetProfilesResponseDTO, ProfileDTO } from "../dto/profile";
import { ProfileTypeEnum, RawProfileConfig, SubscriptionUserInfo, SubscriptionUserInfoSchema } from "../model/profile";
import { BusinessError } from "../errors/business-error";
import { logger } from "../core/logger";

export async function listProfiles(): Promise<GetProfilesResponseDTO> {
  return {
    profiles: getRawProfileConfigs().map(toProfileDTO)
  };
}

export async function createProfile(profile: ProfileDTO): Promise<void> {
  const raw = getRawProfileConfigs();
  const existingProfile = raw.find((p) => p.name === profile.name);
  if (existingProfile) {
    throw new BusinessError(`Profile already exists for name: ${profile.name}`);
  }

  raw.push({...profile});

  await replaceRawProfileConfigs(raw);
}

export async function updateProfile(name: string, profile: ProfileDTO): Promise<void> {
  const raw = getRawProfileConfigs();
  if (name !== profile.name) {
    throw new BusinessError("Profile name cannot be changed");
  }

  const index = raw.findIndex((p) => p.name === profile.name);
  if (index === -1) {
    throw new BusinessError(`Profile not found for name: ${profile.name}`);
  }
  
  const originalProfile = raw[index]!;
  const updatedProfile = toRawProfileConfig(profile);
  if (originalProfile.updateTime) {
    updatedProfile.updateTime = originalProfile.updateTime;
  }
  if (originalProfile.subscriptionUserInfo) {
    updatedProfile.subscriptionUserInfo = originalProfile.subscriptionUserInfo;
  }
  raw[index] = updatedProfile;

  await replaceRawProfileConfigs(raw);
}

export async function deleteProfile(name: string): Promise<void> {
  const raw = getRawProfileConfigs();
  const index = raw.findIndex((p) => p.name === name);
  if (index === -1) {
    throw new BusinessError(`Profile not found for name: ${name}`);
  }

  raw.splice(index, 1);

  await replaceRawProfileConfigs(raw);
}

export async function fetchProfile(name: string): Promise<void> {
  const profileInfo = getProfileInfo(name, ProfileTypeEnum.ORIGIN);
  if (!profileInfo) {
    throw new BusinessError(`Profile not found for name: ${name}`);
  }

  const subscriptionInfo = profileInfo.subscriptionInfo;
  if (!subscriptionInfo) {
    throw new BusinessError(`Profile "${name}" does not have subscription info`);
  }
  const url = subscriptionInfo.url;
  if (!url) {
    throw new BusinessError(`Profile "${name}" does not have a URL to fetch`);
  }

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
      throw new BusinessError(`Request to fetch profile "${name}" from URL: ${url} timed out`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new BusinessError(`Failed to fetch profile "${name}" from URL: ${url}, status: ${response.status}`);
  }

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
        throw new BusinessError(`Profile not found for name: ${name}`);
      }
      raw[index]!.updateTime = Date.now();
      raw[index]!.subscriptionUserInfo = userInfo;
      
      await replaceRawProfileConfigs(raw);
    } catch (err) {
      logger.warn(`Failed to parse subscription-userinfo header for profile "${name}": ${err}`);
    }
  }
}

export async function getProfileContent(name: string, type: ProfileTypeEnum): Promise<GetProfileContentResponseDTO> {
  const { info, content } = await getProfileInfoContent(name, type);
  return {
    name: info.name,
    type: info.type,
    fileName: info.sourceFileName,
    ...(info.subscriptionInfo?.userInfo ? { userInfo: info.subscriptionInfo.userInfo } : {}),
    content,
  };
}

export async function putProfileContent(name: string, content: string): Promise<void> {
  await updateProfileContent(name, content);
}

export async function getProfileContentByOutputFileName(outputFileName: string): Promise<{ fileName: string; userInfo?: SubscriptionUserInfo; content: string; }> {
  const { info, content } = await getProfileInfoByOutputFileName(outputFileName);
  return {
    fileName: info.downloadFileName,
    ...(info.subscriptionInfo?.userInfo ? { userInfo: info.subscriptionInfo.userInfo } : {}),
    content,
  };
}

function toRawProfileConfig(profile: ProfileDTO): RawProfileConfig {
  return {
    name: profile.name,
    originFile: profile.originFile,
    outputFile: profile.outputFile,
    rewriteOutputFile: profile.rewriteOutputFile,
    url: profile.url,
    userAgent: profile.userAgent,
    updateInterval: profile.updateInterval,
  };
}

function toProfileDTO(profile: RawProfileConfig): ProfileDTO {
  return {
    name: profile.name,
    originFile: profile.originFile,
    outputFile: profile.outputFile,
    rewriteOutputFile: profile.rewriteOutputFile,
    url: profile.url,
    userAgent: profile.userAgent,
    updateInterval: profile.updateInterval,
  };
}