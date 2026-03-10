"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SpeechBubbleProps {
  children: React.ReactNode;
  direction?: "left" | "right" | "bottom";
  className?: string;
  delay?: number;
}

export default function SpeechBubble({
  children,
  direction = "bottom",
  className = "",
  delay = 0.3,
}: SpeechBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={cn("relative", className)}
    >
      <div className="bg-white rounded-2xl px-5 py-3 shadow-md border border-amber/20 text-ink text-base leading-snug font-sans max-w-[260px]">
        {children}
      </div>

      {/* Tail */}
      {direction === "bottom" && (
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-3 w-0 h-0"
          style={{
            borderLeft: "10px solid transparent",
            borderRight: "10px solid transparent",
            borderTop: "12px solid white",
          }}
        />
      )}
      {direction === "left" && (
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-0 h-0"
          style={{
            borderTop: "8px solid transparent",
            borderBottom: "8px solid transparent",
            borderRight: "14px solid white",
          }}
        />
      )}
      {direction === "right" && (
        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-0 h-0"
          style={{
            borderTop: "8px solid transparent",
            borderBottom: "8px solid transparent",
            borderLeft: "14px solid white",
          }}
        />
      )}
    </motion.div>
  );
}
