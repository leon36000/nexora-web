import Image from "next/image";
import { mediaPath } from "@/lib/media";
import type { MediaRef } from "@/server/cms/model";

/**
 * Image du CMS via next/image (le SVG reste désactivé : voir next.config.ts et /api/media).
 * `alt` vide = image décorative.
 */
export function CmsImage({
  media,
  sizes,
  className,
  priority = false,
}: {
  media: MediaRef;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={mediaPath(media.id)}
      alt={media.alt}
      width={media.width ?? 1200}
      height={media.height ?? 800}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  );
}
