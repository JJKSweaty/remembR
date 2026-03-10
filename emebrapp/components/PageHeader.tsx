"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-4 px-5 pt-6 pb-4"
    >
      <button
        onClick={() => router.back()}
        className="flex items-center justify-center w-12 h-12 rounded-2xl bg-warm border border-amber/20 text-brown hover:bg-amber/20 active:scale-95 transition-all duration-150 flex-shrink-0"
        aria-label="Go back"
      >
        <ArrowLeft size={22} />
      </button>
      <div>
        <h1 className="font-playfair text-2xl font-semibold text-ink leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ember-muted mt-0.5">{subtitle}</p>}
      </div>
    </motion.div>
  );
}
