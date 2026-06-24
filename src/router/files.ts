import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getProfileContentByOutputFileName } from "../service/profile";

export default async function filesRoute(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: { filename: string };
  }>('/', {
      schema: {
        querystring: z.object({
          filename: z.string(),
        }),
      },
    },
    async (req, reply) => {
      const filename = req.query.filename;
      const { fileName, userInfo, content } = await getProfileContentByOutputFileName(filename);

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${fileName}"; filename*=utf-8''${encodeURIComponent(fileName)}`);
      if (userInfo) {
        reply.header('subscription-userinfo', `upload=${userInfo.upload}; download=${userInfo.download}; total=${userInfo.total}; expire=${userInfo.expire}`);
        // reply.header('profile-update-interval', '24');
      }
      return content;
    }
  );
}