import { z } from "zod";

export const SubscriptionUserInfoSchema = z.object({
  upload: z.int().nonnegative(),
  download: z.int().nonnegative(),
  total: z.int().nonnegative(),
  expire: z.int().nonnegative(),
});

export const RawProfileConfigSchema = z.object({
  name: z.string(),
  originFile: z.string(),
  outputFile: z.string().optional(),
  rewriteOutputFile: z.string().optional(),
  url: z.url().optional(),
  userAgent: z.string().optional(),
  updateInterval: z.int().nonnegative().optional(),
  updateTime: z.int().nonnegative().optional(),
  subscriptionUserInfo: SubscriptionUserInfoSchema.optional(),
});

export type RawProfileConfig = z.infer<typeof RawProfileConfigSchema>;
export type SubscriptionUserInfo = z.infer<typeof SubscriptionUserInfoSchema>;

export enum ProfileTypeEnum {
  ORIGIN = "origin",
  OUTPUT = "output",
  REWRITE = "rewrite",
}

export interface ProfileInfo {
  name: string;
  type: ProfileTypeEnum;
  sourceFileName: string;
  downloadFileName: string;
  subscriptionInfo?: SubscriptionInfo;
};

export interface SubscriptionInfo {
  url: string;
  userAgent?: string;
  updateInterval: number;
  updateTime: number;
  userInfo?: SubscriptionUserInfo;
};