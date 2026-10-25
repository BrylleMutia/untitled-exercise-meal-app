"use client";

import Link from "next/link";
import { ArrowRight, Dumbbell, ShoppingBasket, TrendingUp, UtensilsCrossed } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TodayMealsCard } from "@/components/nutrition/TodayMealsCard";
import { HomeStepsCard, HomeWorkoutsCard } from "@/components/home/HomeActivityCards";
import { HelpHeading } from "@/components/ui/HelpPopover";
import { todayKey } from "@/utility/dates";
import { participationMilestones } from "@/utility/milestones";

const quickLinks = [
  {
    href: "/workouts",
    tone: "peach" as const,
    icon: Dumbbell,
    title: "Workouts",
  },
  {
    href: "/nutrition",
    tone: "lavender" as const,
    icon: UtensilsCrossed,
    title: "Nutrition",
  },
  {
    href: "/grocery",
    tone: "mint" as const,
    icon: ShoppingBasket,
    title: "Grocery",
  },
  {
    href: "/progress",
    tone: "coral" as const,
    icon: TrendingUp,
    title: "Progress",
  },
];

export default function HomePage() {
  const { snapshot } = useApp();
  const milestones = snapshot.profile?.celebrationsEnabled ? participationMilestones(snapshot, todayKey()) : [];
  if (!snapshot.onboarded) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Card tone="lavender" className="w-full max-w-md p-8 text-center">
          <p className="text-5xl" aria-hidden>
            🏋️
          </p>
          <h2 className="mt-4 text-2xl font-extrabold">Let&apos;s set you up</h2>
          <p className="mt-2 text-sm font-semibold text-ink-soft">
            Set up your profile and editable plans.
          </p>
          <Link href="/onboarding" className="mt-6 block">
            <Button className="w-full">Start onboarding</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {milestones.length > 0 ? <Card tone="mint" className="animate-pop lg:col-span-2">
        <HelpHeading title="Personal milestones"><p>Milestones recognize participation and personal firsts. Rest days and missing entries never lose points.</p></HelpHeading>
        <ul className="mt-2 flex flex-wrap gap-2">{milestones.map((milestone) => <li key={milestone} className="rounded-full bg-white/70 px-3 py-2 text-xs font-bold">{milestone}</li>)}</ul>
      </Card> : null}
      <div className="contents lg:mt-[35px] lg:grid lg:content-start lg:gap-4"><TodayMealsCard /></div>
      <div className="grid content-start gap-4 lg:mt-[35px]"><HomeWorkoutsCard /><HomeStepsCard /></div>
      {/* Quick links grid */}
      <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
        {quickLinks.map(({ href, tone, icon: Icon, title }) => (
          <Link key={href} href={href} className="group block">
            <Card tone={tone} className="flex h-full flex-col justify-between transition-transform group-hover:-translate-y-0.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="min-w-0 max-w-full break-words font-extrabold">{title}</h3>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/70">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <p className="mt-3 flex items-center gap-1 text-sm font-extrabold">
                Open <ArrowRight className="h-4 w-4" aria-hidden />
              </p>
            </Card>
          </Link>
        ))}
      </div>

    </div>
  );
}
