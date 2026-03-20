"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Home, Pill, MessageCircle, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { id: "home", label: "Home", icon: Home, href: "/" },
  { id: "meds", label: "Meds", icon: Pill, href: "/meds" },
  { id: "chat", label: "Chat", icon: MessageCircle, href: "/chat" },
  { id: "find", label: "Find", icon: Search, href: "/find" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function getActiveTab(pathname: string): TabId {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/meds")) return "meds";
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/find")) return "find";
  return "home";
}

interface NavBarProps {
  activeTab: TabId;
  onTabChange?: (tab: TabId) => void;
  layoutPrefix?: string;
}

export function NavBar({ activeTab, onTabChange, layoutPrefix = "" }: NavBarProps) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        background: "#1E1C0F",
        border: "1px solid rgba(239,159,39,0.25)",
        borderRadius: 50,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        height: 56,
        padding: "8px 16px",
        width: "fit-content",
        maxWidth: 320,
      }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <motion.button
            key={tab.id}
            layout
            onClick={() => onTabChange?.(tab.id)}
            whileTap={{ scale: 0.85 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            style={{
              position: "relative",
              flex: isActive ? "0 0 auto" : "0 0 44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 40,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              outline: "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {/* Sliding golden pill */}
            {isActive && (
              <motion.div
                layoutId={`${layoutPrefix}active-pill`}
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#EF9F27",
                  borderRadius: 30,
                }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}

            {/* Home orb — glows above icon when home is active */}
            <AnimatePresence>
              {tab.id === "home" && isActive && (
                <motion.div
                  key={`${layoutPrefix}home-orb`}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    position: "absolute",
                    top: -6,
                    left: "50%",
                    marginLeft: -4,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#EF9F27",
                    boxShadow: "0 0 10px 3px rgba(239,159,39,0.7)",
                    zIndex: 10,
                  }}
                />
              )}
            </AnimatePresence>

            {/* Icon + label */}
            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: isActive ? "0 20px" : 0,
              }}
            >
              <Icon
                size={22}
                color={isActive ? "#FFFFFF" : "#4A4232"}
                strokeWidth={2}
              />
              <AnimatePresence>
                {isActive && (
                  <motion.span
                    key={`${layoutPrefix}label-${tab.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: 0.06 }}
                    style={{
                      color: "#FFFFFF",
                      fontSize: 11,
                      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.button>
        );
      })}
    </nav>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = getActiveTab(pathname);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div style={{ pointerEvents: "auto" }}>
        <NavBar
          activeTab={activeTab}
          onTabChange={(tab) =>
            router.push(TABS.find((t) => t.id === tab)!.href)
          }
        />
      </div>
    </div>
  );
}
