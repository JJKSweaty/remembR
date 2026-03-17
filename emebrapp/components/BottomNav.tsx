"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Pill, CalendarDays } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/find", label: "Find", icon: Search },
  { href: "/meds", label: "Meds", icon: Pill },
  { href: "/wellness", label: "Wellness", icon: CalendarDays },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6 px-4 pointer-events-none">
      <nav
        className="pointer-events-auto flex items-center gap-1 px-3 py-2.5 rounded-[28px]"
        style={{
          background: "rgba(253, 246, 238, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(92,61,46,0.14), 0 2px 8px rgba(92,61,46,0.08), 0 0 0 1px rgba(92,61,46,0.07)",
        }}
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-col items-center justify-center rounded-[20px] transition-all duration-200"
              style={{ minWidth: 68, paddingTop: 8, paddingBottom: 8 }}
            >
              {active && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-[20px]"
                  style={{ background: "linear-gradient(135deg, #e8a87c, #d4845a)" }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <div className="relative flex flex-col items-center gap-1">
                <Icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.7}
                  className={cn(
                    "transition-colors duration-200",
                    active ? "text-white" : "text-brown/60"
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] font-semibold tracking-wide transition-colors duration-200",
                    active ? "text-white" : "text-brown/50"
                  )}
                >
                  {tab.label}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
