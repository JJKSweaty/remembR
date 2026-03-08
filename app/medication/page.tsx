"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Check, Clock, AlertCircle } from "lucide-react";
import EmberBear from "@/components/EmberBear";
import SpeechBubble from "@/components/SpeechBubble";
import PageHeader from "@/components/PageHeader";
import BottomNav from "@/components/BottomNav";

interface Medication {
  id: number;
  name: string;
  dose: string;
  time: string;
  taken: boolean;
  overdue: boolean;
  color: string;
}

const initialMeds: Medication[] = [
  { id: 1, name: "Amlodipine", dose: "5mg", time: "8:00 AM", taken: true, overdue: false, color: "bg-rose/30" },
  { id: 2, name: "Metformin", dose: "500mg", time: "9:00 AM", taken: false, overdue: true, color: "bg-amber/30" },
  { id: 3, name: "Atorvastatin", dose: "20mg", time: "1:00 PM", taken: false, overdue: false, color: "bg-sage/30" },
  { id: 4, name: "Aspirin", dose: "75mg", time: "6:00 PM", taken: false, overdue: false, color: "bg-warm" },
];

export default function MedicationPage() {
  const [meds, setMeds] = useState<Medication[]>(initialMeds);
  const [scanning, setScanning] = useState(false);

  const allTaken = meds.every((m) => m.taken);
  const takenCount = meds.filter((m) => m.taken).length;

  const toggleTaken = (id: number) => {
    setMeds((prev) =>
      prev.map((m) => (m.id === id ? { ...m, taken: !m.taken, overdue: !m.taken ? false : m.overdue } : m))
    );
  };

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => setScanning(false), 2000);
  };

  const emberMood = allTaken ? "celebrating" : "idle";

  return (
    <div className="min-h-screen bg-cream flex flex-col pb-28">
      <PageHeader title="My Medication" subtitle="Keep track of your medicines" />

      {/* Ember + speech */}
      <div className="flex items-center gap-3 px-5 mb-5">
        <EmberBear mood={emberMood} size="sm" />
        <SpeechBubble direction="left" delay={0.1}>
          <span className="text-sm">
            {allTaken
              ? "You've taken all your medicines today! ✨"
              : `${takenCount} of ${meds.length} medicines taken`}
          </span>
        </SpeechBubble>
      </div>

      {/* Progress bar */}
      <div className="px-5 mb-6">
        <div className="flex justify-between text-sm text-ember-muted mb-2">
          <span>Today&apos;s progress</span>
          <span className="font-semibold text-amber2">{takenCount}/{meds.length}</span>
        </div>
        <div className="w-full h-3 bg-warm rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-amber to-amber2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(takenCount / meds.length) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Scan button */}
      <div className="px-5 mb-6">
        <button
          onClick={handleScan}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber to-amber2 text-white font-semibold text-lg flex items-center justify-center gap-3 active:scale-95 transition-transform shadow-md"
        >
          <Camera size={24} />
          {scanning ? "Scanning..." : "Scan Medicine"}
        </button>
        <AnimatePresence>
          {scanning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 bg-amber/10 rounded-2xl px-4 py-3 flex items-center gap-3 border border-amber/20"
            >
              <motion.div
                className="w-5 h-5 rounded-full border-2 border-amber2 border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
              <span className="text-sm text-brown">Reading barcode...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Celebration state */}
      <AnimatePresence>
        {allTaken && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="mx-5 mb-6 bg-sage/20 rounded-3xl p-5 border border-sage/30 flex items-center gap-4"
          >
            <EmberBear mood="celebrating" size="sm" />
            <div>
              <p className="font-playfair text-lg font-semibold text-ink">All done!</p>
              <p className="text-sm text-ember-muted">You&apos;ve taken all your medicines today. Well done!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Medication list */}
      <div className="px-5 flex flex-col gap-3">
        <p className="text-sm font-medium text-ember-muted px-1">Today&apos;s medicines</p>

        {meds.map((med, i) => (
          <motion.div
            key={med.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`rounded-2xl p-4 border ${med.taken ? "border-sage/30 bg-sage/10" : med.overdue ? "border-rose/40 bg-rose/10" : `${med.color} border-amber/20`} transition-all duration-300`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${med.taken ? "bg-sage/30" : med.overdue ? "bg-rose/20" : "bg-amber/20"}`}>
                  <span className="text-xl">💊</span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-ink text-base truncate">{med.name}</p>
                  <p className="text-sm text-ember-muted">{med.dose}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  {med.overdue && !med.taken ? (
                    <div className="flex items-center gap-1 text-rose">
                      <AlertCircle size={14} />
                      <span className="text-xs font-medium">Overdue</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-ember-muted">
                      <Clock size={14} />
                      <span className="text-xs">{med.time}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => toggleTaken(med.id)}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 ${med.taken ? "bg-sage text-white" : "bg-white border-2 border-amber/30 text-ember-muted"}`}
                >
                  {med.taken ? <Check size={20} strokeWidth={3} /> : <span className="text-lg">○</span>}
                </button>
              </div>
            </div>

            {med.taken && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="text-xs text-sage font-medium mt-2 pt-2 border-t border-sage/20"
              >
                ✓ Taken today — great job!
              </motion.p>
            )}
          </motion.div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
