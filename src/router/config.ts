import { FastifyInstance } from "fastify";
import { getConfig } from "../service/config";
import { GetConfigResponseDTO } from "../dto/config";

export default async function configRoute(fastify: FastifyInstance) {
  fastify.get<{ Reply: GetConfigResponseDTO }>('/', async () => {
    return getConfig();
  });
}