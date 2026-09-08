"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Dumbbell,
  Home,
  ShoppingBasket,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", icon: UtensilsCrossed },
  { href: "/grocery", label: "Grocery", icon: ShoppingBasket },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-full bg-white/90 p-2 shadow-card backdrop-blur md:hidden"
    >
      <ul className="flex items-center justify-between gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={`flex h-12 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-lav-100 text-ink" : "text-muted hover:bg-lav-50"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="sr-only">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
