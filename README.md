# palisade-docs

The docs and landing site for [Palisade WAF](https://github.com/sinhaparth5/palisade-waf), a single-binary web application firewall and reverse proxy for Linux built on Coraza v3 and the OWASP Core Rule Set. The site runs on Next.js 16 and [Fumadocs](https://fumadocs.dev).

## Running it locally

Use pnpm. The lockfile is `pnpm-lock.yaml`, and installs should stay consistent with it.

```bash
pnpm install   # also generates Fumadocs metadata via postinstall
pnpm dev       # http://localhost:3000
```

Other scripts:

| Command            | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| `pnpm build`       | Production build. Also catches integration errors.              |
| `pnpm start`       | Serves a finished production build.                             |
| `pnpm types:check` | Regenerates MDX and route types, then runs `tsc --noEmit`.      |
| `pnpm lint`        | Biome check.                                                    |
| `pnpm format`      | Biome format with import sorting. Run it before opening a PR.   |

There are no tests. To check a change, run `pnpm lint`, `pnpm types:check` and `pnpm build`, then look at it in `pnpm dev`.

## Where things live

Docs and blog posts are Markdown/MDX files under `content/docs/` and `content/blog/`. They are not React routes. `source.config.ts` defines both collections and their frontmatter schemas. Blog posts need `slug` and `date`.

A few details that are easy to miss when you add content:

- Author and tag ids in blog frontmatter have to exist in `content/blog/authors.json` and `content/blog/tags.json`.
- Each blog post's image is registered in the `blogImages` map in `src/lib/blog.ts`. If you skip that, the post uses the generic SEO image.
- MDX supports admonitions like `:::note` through `remark-directive`.

Code is in `src/`:

| Path                       | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `src/lib/source.ts`        | The `source` and `blogSource` loaders. Content lookups go through these. |
| `src/lib/shared.ts`        | Route constants and `gitConfig` for "edit on GitHub" links.    |
| `src/app/(home)`           | Landing page.                                                  |
| `src/app/docs`             | Docs pages. `/docs` redirects to `/docs/intro`.                |
| `src/app/blog`             | Blog posts.                                                    |
| `src/app/api/search`       | Search endpoint (Orama).                                       |
| `src/app/og`               | Generated OG images for doc pages.                             |
| `src/app/llms*`            | `llms.txt` and Markdown exports of the docs.                   |
| `src/components/icons`     | Custom SVG icons. `ICON_REPLACEMENTS.md` tracks what's left.   |

`proxy.ts` sends `.md` URLs, and clients that prefer Markdown, to the raw Markdown version of a doc page instead of the HTML one.

`.source/` and `.next/` are generated. Don't edit or commit them. `docs.md` at the root is an old export from the Docusaurus site, kept for reference. The app doesn't serve it.

## Deployment

Pushing to `master` deploys to production. There is no staging. The GitHub Actions workflow in `.github/workflows/deploy-production.yml` builds the `Dockerfile` image, pushes it to GHCR, and restarts the `coraza-waf-docs` container on the VPS.
