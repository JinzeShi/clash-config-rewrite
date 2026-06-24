import { FastifyInstance } from "fastify";
import { getRewrite, putRewrite, runRewrite } from "../service/rewrite";
import { z } from "zod";

export default async function rewriteRoute(fastify: FastifyInstance) {
  fastify.get<{ Reply: string }>('/script', async () => {
    return getRewrite();
  });

  fastify.put<{ Body: string }>('/script', {
      schema: {
        body: z.string(),
      },
    },
    async (request) => {
      await putRewrite(request.body);
      return { code: 'SUCCESS', message: 'Rewrite configuration updated successfully' };
    },
  );

  fastify.post('/run', async () => {
    const { total, fail, msg } = await runRewrite();
    return { code:'SUCCESS', message: `Profile Rewrite Complete: Total: ${total}, Fail: ${fail}, Message: ${msg}` };
  });
}