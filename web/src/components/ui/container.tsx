import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/cn";

type ContainerProps<T extends ElementType> = {
  as?: T;
  /** "page" : largeur maximale du site ; "measure" : colonne de lecture (~ 65 caractères). */
  size?: "page" | "measure";
} & Omit<ComponentPropsWithoutRef<T>, "as">;

/** Colonne centrée avec marges latérales fluides (gouttière). */
export function Container<T extends ElementType = "div">({ as, size = "page", className, ...props }: ContainerProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cn("mx-auto w-full px-gutter", size === "page" ? "max-w-page" : "max-w-measure", className)}
      {...props}
    />
  );
}
