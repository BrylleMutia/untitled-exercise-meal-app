import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Calisthenics & Nutrition Coach",
    short_name: "CaliCoach",
    description:
      "Follow a realistic calisthenics routine, eat toward your goal, and see whether your habits are working.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5fa",
    theme_color: "#e2def6",
    icons: [
      {
        src: "/icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
