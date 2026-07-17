import { fetchAndRewriteProfile, getDefaultFileName, getProfileInfo, getProfileInfoByOutputFileName, getProfileInfoContent, getRawProfileConfigs, replaceRawProfileConfigs, updateProfileContent } from "../core/profile";
import { GetProfileContentResponseDTO, GetProfilesResponseDTO, GetProfileSuggestionsResponseDTO, ProfileDTO } from "../dto/profile";
import { ProfileTypeEnum, RawProfileConfig, SubscriptionUserInfo } from "../model/profile";
import { BusinessError } from "../errors/business-error";

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

  await fetchAndRewriteProfile(profileInfo);
}

export async function getProfileSuggestions(name: string): Promise<GetProfileSuggestionsResponseDTO> {
  return {
    originFile: getDefaultFileName(name, ProfileTypeEnum.ORIGIN),
    outputFile: getDefaultFileName(name, ProfileTypeEnum.OUTPUT),
    rewriteOutputFile: getDefaultFileName(name, ProfileTypeEnum.REWRITE),
  };
}

export async function getProfileContent(name: string, type: ProfileTypeEnum): Promise<GetProfileContentResponseDTO> {
  const { info, content } = await getProfileInfoContent(name, type);
  return {
    name: info.name,
    type: info.type,
    fileName: info.sourceFileName,
    ...(info.subscriptionInfo?.updateTime ? { updateTime: info.subscriptionInfo.updateTime } : {}),
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