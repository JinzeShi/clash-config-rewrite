import { getRewriteJs, replaceRewriteJs, rewriteProfileAll } from "../core/rewrite";

export async function getRewrite(): Promise<string> {
  return getRewriteJs();
}

export async function putRewrite(content: string): Promise<void> {
  await replaceRewriteJs(content);
}

export async function runRewrite(): Promise<{ total: number; fail: number; msg: string }> {
  return await rewriteProfileAll();
}