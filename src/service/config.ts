import { getOriginDir, getOutputDir } from "../core/config";
import { GetConfigResponseDTO } from "../dto/config";

export async function getConfig(): Promise<GetConfigResponseDTO> {
  return {
    originDir: getOriginDir(),
    outputDir: getOutputDir()
  };
}