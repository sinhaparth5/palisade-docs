import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";
import { GithubIcon } from "@/components/icons";
import logo from "@/static/img/logo.svg";
import { appName, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2 font-display text-lg leading-none">
          <Image src={logo} alt="" width={26} height={26} unoptimized />
          {appName}
        </span>
      ),
    },
    links: [
      { text: "Docs", url: "/docs" },
      { text: "Blog", url: "/blog" },
      { text: "Pro", url: "/pro" },
      {
        type: "icon",
        text: "GitHub",
        label: "GitHub",
        url: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
        external: true,
        icon: <GithubIcon aria-hidden="true" className="size-5" size={20} />,
      },
    ],
  };
}
