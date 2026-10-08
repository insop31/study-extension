// Line icons for navigation and headings. Use as <Icons.Home />.

import type { ReactNode } from "react";


function Icon({
  children,
  size = 18
}: {
  children: ReactNode;
  size?: number;
}) {

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );

}

export function Home() {

  return <Icon><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></Icon>;

}

export function Week() {

  return <Icon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>;

}

export function Topics() {

  return <Icon><path d="M5 19c9 0 14-6 14-15C10 4 5 9 5 19z" /><path d="M5 19l8-8" /></Icon>;

}

export function Activity() {

  return <Icon><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></Icon>;

}

export function Recent() {

  return <Icon><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Icon>;

}

export function Plan() {

  return <Icon><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" /><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></Icon>;

}

export function Timer() {

  return <Icon><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></Icon>;

}

export function Leaf() {

  return <Icon><path d="M5 19c9 0 14-6 14-15C10 4 5 9 5 19z" /></Icon>;

}

export function Chart() {

  return <Icon><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Icon>;

}

export function Logout() {

  return <Icon><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></Icon>;

}

export function Refresh() {

  return <Icon><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></Icon>;

}
