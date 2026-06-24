import { z } from "zod";
import { ProfileTypeEnum, SubscriptionUserInfo } from "../model/profile";

export const ProfileSchema = z.object({
  name: z.string(),
  originFile: z.string(),
  outputFile: z.string().optional(),
  rewriteOutputFile: z.string().optional(),
  url: z.url().optional(),
  userAgent: z.string().optional(),
  updateInterval: z.int().nonnegative().optional()
});

export type ProfileDTO = z.infer<typeof ProfileSchema>;

export type GetProfilesResponseDTO = {
  profiles: ProfileDTO[];
};

export type GetProfileContentResponseDTO = {
  name: string;
  type: ProfileTypeEnum;
  fileName: string;
  userInfo?: SubscriptionUserInfo;
  content: string;
};