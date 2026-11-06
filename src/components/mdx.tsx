import { ImageZoom } from "fumadocs-ui/components/image-zoom";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import Image, { type StaticImageData } from "next/image";
import { type ComponentPropsWithoutRef, createElement } from "react";
import archDiagram from "@/static/img/arch_diagram_white-bg.png";

const contentImages: Record<string, StaticImageData> = {
  "/img/arch_diagram_white-bg.png": archDiagram,
};

function isStaticImageData(value: unknown): value is StaticImageData {
  return typeof value === "object" && value !== null && "src" in value;
}

export function ContentImage({
  src,
  alt = "",
  className,
  ...props
}: ComponentPropsWithoutRef<"img">) {
  const source = src as unknown;
  const image =
    typeof source === "string"
      ? contentImages[source]
      : isStaticImageData(source)
        ? source
        : undefined;

  if (!image) {
    return createElement(defaultMdxComponents.img ?? "img", {
      src,
      alt,
      className,
      ...props,
    });
  }

  return (
    // Screenshots are 2x captures shrunk into the prose column, so render at
    // high quality and let readers click through to the full-resolution PNG.
    <ImageZoom src={image} alt={alt}>
      <Image
        src={image}
        alt={alt}
        quality={90}
        sizes="(max-width: 768px) 100vw, 768px"
        className={`my-8 h-auto w-full rounded-xl border border-fd-border shadow-sm ${className ?? ""}`}
      />
    </ImageZoom>
  );
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ContentImage,
    img: ContentImage,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
