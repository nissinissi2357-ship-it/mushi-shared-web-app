import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ムシムシ探検隊",
    short_name: "ムシ探",
    description: "虫の観察記録、ランキング、記録照会をスマホで管理できるムシムシ探検隊アプリ",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f3ee",
    theme_color: "#f1f3ee",
    lang: "ja",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      },
      {
        src: "/apple-touch-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml"
      }
    ]
  };
}
