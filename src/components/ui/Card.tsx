import type { HTMLAttributes, ReactNode } from "react";

export type CardTone = "white" | "blush" | "lavender" | "peach" | "mint" | "coral";

const toneClasses: Record<CardTone, string> = {
  white: "bg-white",
  blush: "bg-blush-100",
  lavender: "bg-lav-100",
  peach: "bg-peach-100",
  mint: "bg-mint-100",
  coral: "bg-coral-100",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  children: ReactNode;
}

export function Card({ tone = "white", className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`min-w-0 rounded-3xl p-5 shadow-card ${toneClasses[tone]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
