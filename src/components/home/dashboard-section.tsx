import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import dashboardImage from "@/static/img/hero_image.png";
import { eyebrow } from "./constants";
import { ExceptionStream } from "./exception-stream";
import { Scribble } from "./scribbles";
import { TiltFigure } from "./scroll-motion";

const notes = [
  "live request log, no aggregator",
  "filter by status, app or date",
  "edit a service, it hot-reloads",
];

export function DashboardSection() {
  return (
    <section className="border-b border-rule px-5 py-20 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className={`section-no ${eyebrow}`}>Admin dashboard</p>
          <h2 className="mt-4 text-balance text-4xl leading-tight text-ink">
            See every decision as it happens.
          </h2>
        </div>

        <div className="mt-12 grid items-start gap-8 lg:grid-cols-[1fr_14rem]">
          <TiltFigure className="m-0 -rotate-[0.5deg] overflow-hidden rounded-md border border-rule bg-paper-2 p-2 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]">
            <Image
              src={dashboardImage}
              alt="Palisade v3.3.3 admin dashboard: today's requests, blocked, challenged and visitor counts, live requests per second and latency, 24 hours of allowed and blocked traffic, top countries, and enforcement by WAF rules, IP blocklist, rate limits and bot challenges"
              sizes="(max-width: 1024px) 92vw, 860px"
              quality={88}
              className="h-auto w-full rounded-sm"
            />
          </TiltFigure>

          <ul className="space-y-6 lg:pt-10">
            {notes.map((note) => (
              <li
                key={note}
                className="flex items-start gap-2 font-hand text-2xl leading-7 text-ink"
              >
                <Scribble
                  kind="arrow-right"
                  className="mt-1 hidden h-5 w-9 shrink-0 rotate-180 text-accent lg:block"
                />
                {note}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-16 grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div>
            <h3 className="text-balance text-3xl leading-tight text-ink">
              Blocked a real customer? Fix it from the log.
            </h3>
            <p className="mt-4 text-pretty leading-7 text-ink-soft">
              Open the blocked request and click{" "}
              <strong className="font-semibold text-ink">
                Create exception
              </strong>
              . The rule is turned off for that service only and the WAF
              reloads. Before you add a new rule, dry-run it against the last
              2000 logged requests to see what it would change.
            </p>
            <Link
              href="/docs/security/waf#dry-run-candidate-rules"
              className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
            >
              Exceptions and dry-runs
              <ArrowRightIcon aria-hidden="true" size={14} />
            </Link>
          </div>
          <div className="crop-marks rounded-lg border border-rule bg-paper p-4 sm:p-6">
            <ExceptionStream />
            <p className="sr-only">
              Illustration: a live request log. A search for o'brien is blocked
              by rule 942100. Create exception is clicked, the rule is turned
              off for the shop service, and the same request then passes. A
              dry-run then replays 2000 logged requests and marks two whose
              verdict would change, without saving anything.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
