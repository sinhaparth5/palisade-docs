import type { Metadata } from "next";
import Link from "next/link";
import { FooterSection } from "@/components/home";
import {
  eyebrow,
  GITHUB_URL,
  primaryButton,
  secondaryButton,
} from "@/components/home/constants";
import { Rosette } from "@/components/home/ornaments";
import { appName } from "@/lib/shared";

export const metadata: Metadata = {
  title: `${appName} Pro (coming soon)`,
  description: `${appName} Pro is a paid edition for running ${appName} across many servers, for a team, or under an audit. It is under construction.`,
};

const building = [
  {
    name: "Cluster config sync",
    text: "Replicas follow a primary node. Configure services, rules and settings once and every node picks them up.",
  },
  {
    name: "Fleet bans and rate limits",
    text: "An IP banned on one node is blocked on all of them within seconds, so an attacker behind a load balancer doesn't get a budget per node.",
  },
  {
    name: "SIEM / log export",
    text: "Ship request logs and the audit log to syslog, Splunk, Elastic, OpenTelemetry or any HTTPS endpoint.",
  },
  {
    name: "Central logs",
    text: "See the whole fleet's requests on the primary's Logs page and dashboards, with a column for the node that served each one.",
  },
];

const planned = [
  {
    name: "Config history and rollback",
    text: "See who changed what and restore any earlier version in one click.",
  },
  {
    name: "Managed rule feed",
    text: "Signed virtual patches for new CVEs, delivered daily without a new release.",
  },
  {
    name: "Compliance reports",
    text: "PCI DSS 4.0 script inventory (6.4.3 / 11.6.1) and a monthly security report, as PDF or CSV.",
  },
  {
    name: "Change approval",
    text: "Selected settings need a second admin to approve before they apply.",
  },
  {
    name: "Per-service admin scopes",
    text: "Give an admin or viewer access to only some services.",
  },
];

const promises = [
  "Nothing that is free today moves behind a license.",
  "Without a key, the Pro binary is the free WAF.",
  "If a license expires, paid features turn off and the WAF keeps protecting traffic.",
  "Licenses are checked offline. No call home, works on air-gapped servers.",
];

function FeatureList({
  items,
  status,
}: {
  items: { name: string; text: string }[];
  status: string;
}) {
  return (
    <ul className="mt-8 grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-2">
      {items.map(({ name, text }) => (
        <li key={name} className="bg-paper p-6">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-stamp">
            {status}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-ink">{name}</h3>
          <p className="mt-2 text-pretty leading-7 text-ink-soft">{text}</p>
        </li>
      ))}
    </ul>
  );
}

export default function ProPage() {
  return (
    <div className="field-notes paper-grain flex flex-1 flex-col bg-paper text-ink">
      <div
        role="status"
        className="border-b border-ink/30 bg-[repeating-linear-gradient(-45deg,var(--color-accent)_0_14px,var(--color-paper)_14px_28px)] px-5 py-2 sm:px-8"
      >
        <p className="mx-auto w-fit rounded-sm bg-paper px-3 py-1 text-center font-mono text-xs uppercase tracking-[0.14em] text-ink">
          Under construction · not on sale yet
        </p>
      </div>

      <section className="relative overflow-x-clip border-b border-rule px-5 pb-16 pt-14 sm:px-8 lg:pb-24 lg:pt-20">
        <Rosette className="pointer-events-none absolute -right-40 -top-28 size-[36rem] text-ink opacity-[0.09] lg:-right-24" />
        <div className="relative mx-auto max-w-3xl">
          <p className={eyebrow}>{appName} Pro · coming soon</p>
          <h1 className="mt-5 text-balance text-[2.6rem] leading-[1.05] tracking-[-0.01em] text-ink sm:text-6xl">
            The paid edition is being <span className="highlight">built</span>{" "}
            right now.
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-ink-soft">
            Open-source {appName} stays complete on one server. Pro adds what
            you need to run it across many servers, for a team, or under an
            audit. Plans and pricing aren&apos;t final yet; this page will
            change when it launches.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className={primaryButton}
            >
              Watch the repo for the release
            </Link>
            <Link href="/docs" className={secondaryButton}>
              Use the free version today
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-rule px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className={eyebrow}>In progress</p>
          <h2 className="mt-4 text-balance text-4xl leading-tight text-ink">
            Being built now.
          </h2>
          <FeatureList items={building} status="Building" />
        </div>
      </section>

      <section className="border-b border-rule px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className={eyebrow}>Roadmap</p>
          <h2 className="mt-4 text-balance text-4xl leading-tight text-ink">
            Planned next.
          </h2>
          <FeatureList items={planned} status="Planned" />
        </div>
      </section>

      <section className="border-b border-rule px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <p className={eyebrow}>Our promise</p>
          <h2 className="mt-4 text-balance text-4xl leading-tight text-ink">
            The free WAF stays free.
          </h2>
          <ul className="mt-8 border-t border-rule">
            {promises.map((p) => (
              <li
                key={p}
                className="flex gap-4 border-b border-rule py-5 text-lg text-ink"
              >
                <span aria-hidden="true" className="font-mono text-accent">
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-8 leading-7 text-ink-soft">
            Need one of these features most?{" "}
            <Link
              href={`${GITHUB_URL}/issues`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-accent"
            >
              Open an issue
            </Link>{" "}
            and tell us.
          </p>
        </div>
      </section>

      <FooterSection />
    </div>
  );
}
