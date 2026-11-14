import type { MetadataRoute } from "next";
import { getBlogPosts } from "@/lib/blog";
import { siteUrl as baseUrl } from "@/lib/shared";
import { source } from "@/lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
  const docsPages: MetadataRoute.Sitemap = source.getPages().map((page) => ({
    url: `${baseUrl}${page.url}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const blogPosts: MetadataRoute.Sitemap = getBlogPosts().map((post) => ({
    url: `${baseUrl}${post.url}`,
    lastModified: new Date(`${post.data.date}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/pro`, changeFrequency: "monthly", priority: 0.5 },
    ...docsPages,
    ...blogPosts,
  ];
}
