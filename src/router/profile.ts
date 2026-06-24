import { FastifyInstance } from "fastify";
import { GetProfileContentResponseDTO, GetProfilesResponseDTO, ProfileDTO, ProfileSchema } from "../dto/profile";
import { createProfile, deleteProfile, fetchProfile, getProfileContent, listProfiles, putProfileContent, updateProfile } from "../service/profile";
import { z } from "zod";
import { ProfileTypeEnum } from "../model/profile";

export default async function profileRoute(fastify: FastifyInstance) {
  fastify.get<{ Reply: GetProfilesResponseDTO }>('/', async () => {
    return listProfiles();
  });

  fastify.post<{ Body: ProfileDTO }>('/', {
      schema: {
        body: ProfileSchema,
      },
    },
    async (req) => {
      const profile = req.body;
      await createProfile(profile);
      return { code: 'SUCCESS', message: `Profile "${profile.name}" created successfully` };
    },
  );

  fastify.put<{
    Params: { name: string };
    Body: ProfileDTO;
  }>('/:name', {
      schema: {
        body: ProfileSchema,
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async (req) => {
      const name = req.params.name;
      const profile = req.body;
      await updateProfile(name, profile);
      return { code: 'SUCCESS', message: `Profile "${name}" updated successfully` };
    },
  );

  fastify.delete<{
    Params: { name: string };
  }>('/:name', {
      schema: {
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async (req) => {
      const name = req.params.name;
      await deleteProfile(name);
      return { code: 'SUCCESS', message: `Profile "${name}" deleted successfully` };
    }
  );

  fastify.post<{
    Params: { name: string };
  }>('/:name/fetch', {
      schema: {
        params: z.object({
          name: z.string(),
        }),
      },
    },
    async (req) => {
      const name = req.params.name;
      await fetchProfile(name);
      return { code: 'SUCCESS', message: `Profile "${name}" fetched successfully` };
    }
  );

  fastify.get<{
    Params: { name: string };
    Reply: GetProfileContentResponseDTO;
  }>('/:name/content', {
    schema: {
      params: z.object({
        name: z.string(),
      }),
    },
  },
    async (req) => {
      const name = req.params.name;
      return await getProfileContent(name, ProfileTypeEnum.ORIGIN);
    }
  );

  fastify.get<{
    Params: { name: string; type: ProfileTypeEnum };
    Reply: GetProfileContentResponseDTO;
  }>('/:name/content/:type', {
      schema: {
        params: z.object({
          name: z.string(),
          type: z.enum(ProfileTypeEnum),
        }),
      },
    },
    async (req) => {
      const name = req.params.name;
      const type = req.params.type;
      return await getProfileContent(name, type);
    }
  );

  fastify.put<{
    Params: { name: string };
    Body: string;
  }>('/:name/content', {
      schema: {
        params: z.object({
          name: z.string()
        }),
        body: z.string(),
      },
    },
    async (req) => {
      const name = req.params.name;
      const content = req.body;
      await putProfileContent(name, content);
      return { code: 'SUCCESS', message: `Profile "${name}" content updated successfully` };
    }
  );
}