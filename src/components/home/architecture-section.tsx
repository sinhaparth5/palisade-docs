import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import archDiagram from "@/static/img/arch_diagram_white-bg.png";
import { eyebrow, pipeline } from "./constants";
import { PipelineStream } from "./pipeline-stream";
import { ScrollRule } from "./scroll-motion";

export function ArchitectureSection() {
  return (
    <section className="grid-paper border-b border-rule bg-paper-2/60 px-5 py-20 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className={`section-no ${eyebrow}`}>The request pipeline</p>
          <h2 className="mt-4 text-balance text-4xl leading-tight text-ink">
            Every request runs the same checks, in the same order.
          </h2>
          <p className="mt-4 text-pretty leading-7 text-ink-soft">
            No sidecars, no service mesh, no extra network hop between checks.
            Whatever survives step four is routed to your backend.
          </p>
        </div>

        <div className="crop-marks mt-12 rounded-lg border border-rule bg-paper p-4 sm:p-6">
          <PipelineStream />
          <p className="sr-only">
            Illustration: requests travel through five checkpoints. Headless
            bots fail the proof-of-work gate, floods get a 429, blocked
            countries are refused, attacks get a 403 from the WAF, and the rest
            are routed to a backend.
          </p>
        </div>

        <div className="relative mt-6">
          {/* The request travelling through the stages as you read them. */}
          <ScrollRule
            axis="x"
            offset={["start 85%", "start 40%"]}
            className="inset-x-0 top-0 z-10 hidden h-0.5 rounded-full sm:block"
          />
          <ScrollRule
            axis="y"
            offset={["start 80%", "end 60%"]}
            className="inset-y-0 left-0 z-10 w-0.5 rounded-full sm:hidden"
          />
          <ol className="grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-5">
            {pipeline.map(({ stage, title, detail }, index) => (
              <li key={stage} className="relative bg-paper p-5">
                <p className="font-mono text-xs text-ink-soft">
                  {stage}
                  <span aria-hidden="true" className="text-accent">
                    {index < pipeline.length - 1 ? " ──▶" : " ✓"}
                  </span>
                </p>
                <h3 className="mt-3 text-xl text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{detail}</p>
              </li>
            ))}
          </ol>
        </div>

        <figure className="parallax relative mx-auto mt-16 max-w-5xl [--parallax:-1rem] sm:[--parallax:-2rem]">
          {/* Tape strips holding the diagram to the page. */}
          <span
            aria-hidden="true"
            className="absolute -top-3 left-10 z-10 h-6 w-24 -rotate-6 bg-highlight/70"
          />
          <span
            aria-hidden="true"
            className="absolute -top-3 right-10 z-10 h-6 w-24 rotate-3 bg-highlight/70"
          />
          <div className="rotate-[0.4deg] rounded-sm bg-white p-3 shadow-[0_1px_0_var(--color-rule),0_12px_30px_-18px_rgba(0,0,0,0.35)] sm:p-5">
            <Image
              src={archDiagram}
              alt="Palisade architecture: a request passes the optional CDN and OS firewall, then IP rules, geo rules, bot challenge, rate limit, gate and Coraza WAF before the reverse proxy routes it to a backend; logs go asynchronously to SQLite, MySQL or Postgres, managed from the admin dashboard"
              sizes="(max-width: 1100px) 92vw, 1024px"
              quality={88}
              className="h-auto w-full"
            />
          </div>
          <figcaption className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="font-hand text-xl text-ink-soft">
              fig. 3: the whole request path, end to end
            </span>
            <Link
              href="/docs/overview/architecture"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
            >
              Read the architecture docs
              <ArrowRightIcon aria-hidden="true" size={14} />
            </Link>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
