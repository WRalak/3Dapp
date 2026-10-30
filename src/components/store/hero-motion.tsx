"use client";

import { motion } from "framer-motion";

export function HeroMotion({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
