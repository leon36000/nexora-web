import { handleMedia } from "@/server/cms/media";
import { cmsBaseUrl } from "@/server/cms/runtime";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/media/[id]">,
) {
  const { id } = await ctx.params;
  return handleMedia(
    id,
    {
      baseUrl: cmsBaseUrl(),
      token: process.env.DIRECTUS_READER_TOKEN ?? "",
    },
    { range: request.headers.get("range") },
  );
}
