"use client";

import { useRouter, usePathname } from "next/navigation";

const tabs = [
  {
    id: "home",
    label: "Home",
    href: "/",
    path: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  },
  {
    id: "find",
    label: "Find",
    href: "/find",
    path: "M 3 11 a 8 8 0 1 0 16 0 a 8 8 0 0 0 -16 0 M21 21l-4.35-4.35",
  },
  {
    id: "wellness",
    label: "Wellness",
    href: "/wellness",
    // Sun icon
    path: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10 M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42",
  },
];

function pathnameToId(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname === "/find") return "find";
  if (pathname === "/wellness") return "wellness";
  if (pathname === "/settings") return "home";
  if (pathname === "/summary") return "home";
  if (pathname === "/meds") return "home";
  if (pathname === "/day") return "home";
  return "home";
}

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const activeId = pathnameToId(pathname);

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: "100%",
      maxWidth: 430,
      background: "rgba(254,250,244,0.94)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderTop: "1px solid rgba(200,160,100,0.12)",
      display: "flex",
      justifyContent: "space-around",
      alignItems: "flex-start",
      padding: "14px 0 24px",
      zIndex: 200,
    }}>
      {tabs.map(t => {
        const active = activeId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => router.push(t.href)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 12px",
              color: active ? "#c87840" : "rgba(60,40,20,0.3)",
              transition: "color 0.2s",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={active ? 2 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {t.path.split(" M").map((p, i) => (
                <path key={i} d={i === 0 ? p : "M" + p} />
              ))}
            </svg>
            <span style={{
              fontSize: 11,
              fontWeight: active ? 600 : 400,
              letterSpacing: "0.04em",
              fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
            }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
