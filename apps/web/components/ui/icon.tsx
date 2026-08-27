import type { ReactNode, SVGProps } from "react";
import type { PortalNavigationItem } from "../../lib/portal";

export type IconName = PortalNavigationItem["icon"] | "chevron" | "close" | "menu" | "search";

const paths: Record<IconName, ReactNode> = {
  overview: <><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6"/></>,
  transfers: <><path d="M4 7h14"/><path d="m15 4 3 3-3 3M20 17H6"/><path d="m9 14-3 3 3 3"/></>,
  funding: <><path d="M4 8h16M6 8V5h12v3M6 8v11h12V8M9 12h6M9 15.5h4"/></>,
  payouts: <><path d="M5 4.5h11l3 3v12H5z"/><path d="M16 4.5v4h4M9 14h6M12 11v6"/></>,
  exceptions: <><path d="M12 3.5 21 20H3L12 3.5Z"/><path d="M12 9v5M12 17.2v.2"/></>,
  users: <><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  configuration: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.38.28.6.72.6 1.2v3.6c0 .48-.22.92-.6 1.2Z"/></>,
  activity: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, className = "icon", ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
