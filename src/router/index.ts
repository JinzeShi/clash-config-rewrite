import Fastify from "fastify";
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler, ZodTypeProvider } from "@fastify/type-provider-zod";
import fastifyStatic from "@fastify/static";
import path from "path";
import configRoute from "./config";
import rewriteRoute from "./rewrite";
import profileRoute from "./profile";
import filesRoute from "./files";
import { BusinessError } from "../errors/business-error";
import { CoreError } from "../errors/core-error";

export function buildApp() {
  const app = Fastify({
    logger: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(fastifyStatic, {
    root: path.join(__dirname, "../../public"),
    prefix: "/",
  })

  app.register(configRoute, {
    prefix: '/api/config',
  });

  app.register(rewriteRoute, {
    prefix: '/api/rewrite',
  });

  app.register(profileRoute, {
    prefix: '/api/profile',
  });

  app.register(filesRoute, {
    prefix: '/api/files',
  });

  app.setErrorHandler((err, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      reply.log.info(`Validation error occurred: ${err.message}`);
      return reply.status(400).send({
        code: 'BAD_REQUEST',
        message: err.message,
      });
    }

    if (err instanceof CoreError) {
      reply.log.info(`Core error occurred: ${err.message}`);
      return reply.status(400).send({
        code: 'CORE_ERROR',
        message: err.message,
      });
    }

    if (err instanceof BusinessError) {
      reply.log.info(`Business error occurred: ${err.message}`);
      return reply.status(err.code).send({
        code: 'BUSINESS_ERROR',
        message: err.message,
      });
    }

    reply.log.error(`Unhandled error occurred: ${err instanceof Error ? err.stack : String(err)}`);
    reply.status(500).send({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  });

  return app;
}