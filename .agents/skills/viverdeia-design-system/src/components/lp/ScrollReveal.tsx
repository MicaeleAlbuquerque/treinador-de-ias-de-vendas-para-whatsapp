import { ReactNode } from "react";
import { motion, Variants } from "framer-motion";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  direction?: "up" | "down" | "left" | "right" | "none";
  delay?: number;
  duration?: number;
  distance?: number;
  variant?: "default" | "glitch" | "terminal" | "scale-blur";
}

const defaultVariants = (
  direction: string,
  distance: number,
  duration: number,
  delay: number
): Variants => {
  const offsets: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: distance },
    down: { x: 0, y: -distance },
    left: { x: distance, y: 0 },
    right: { x: -distance, y: 0 },
    none: { x: 0, y: 0 },
  };
  const { x, y } = offsets[direction] || offsets.up;

  return {
    hidden: { opacity: 0, x, y, filter: "blur(8px)" },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      filter: "blur(0px)",
      transition: { duration, delay, ease: [0.16, 1, 0.3, 1] },
    },
  };
};

const glitchVariants = (delay: number): Variants => ({
  hidden: { opacity: 0, x: -20, skewX: -5, filter: "blur(10px) hue-rotate(90deg)" },
  visible: {
    opacity: 1,
    x: 0,
    skewX: 0,
    filter: "blur(0px) hue-rotate(0deg)",
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] },
  },
});

const terminalVariants = (delay: number): Variants => ({
  hidden: { opacity: 0, y: 30, clipPath: "inset(0 100% 0 0)" },
  visible: {
    opacity: 1,
    y: 0,
    clipPath: "inset(0 0% 0 0)",
    transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] },
  },
});

const scaleBlurVariants = (delay: number): Variants => ({
  hidden: { opacity: 0, scale: 0.85, filter: "blur(20px)" },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] },
  },
});

const ScrollReveal = ({
  children,
  className = "",
  direction = "up",
  delay = 0,
  duration = 0.7,
  distance = 60,
  variant = "default",
}: ScrollRevealProps) => {
  const variants =
    variant === "glitch"
      ? glitchVariants(delay)
      : variant === "terminal"
        ? terminalVariants(delay)
        : variant === "scale-blur"
          ? scaleBlurVariants(delay)
          : defaultVariants(direction, distance, duration, delay);

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default ScrollReveal;
