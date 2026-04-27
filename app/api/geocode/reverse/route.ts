import { NextResponse } from "next/server";
import { getViewerFromSession } from "@/lib/data";
import { normalizeLocationText, resolveKnownLocation } from "@/lib/locations";
import { readSession } from "@/lib/session";

type ReverseResult = {
  address?: Record<string, string | undefined>;
  display_name?: string;
};

const DETAIL_KEYS = [
  "borough",
  "suburb",
  "quarter",
  "neighbourhood",
  "city_district",
  "municipality",
  "town",
  "village",
  "hamlet",
  "road"
] as const;

function buildLocationDetail(address: Record<string, string | undefined>, region: string) {
  const seen = new Set<string>();
  const regionNormalized = normalizeLocationText(region);
  const parts: string[] = [];

  for (const key of DETAIL_KEYS) {
    const value = address[key];
    if (!value) {
      continue;
    }

    const normalized = normalizeLocationText(value);
    if (!normalized || normalized === regionNormalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    parts.push(value.trim());

    if (parts.length >= 3) {
      break;
    }
  }

  return parts.join("");
}

export async function GET(request: Request) {
  try {
    const session = await readSession();
    const viewer = await getViewerFromSession(session);
    if (!viewer) {
      return NextResponse.json({ error: "ログインしてください。" }, { status: 401 });
    }

    const url = new URL(request.url);
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return NextResponse.json({ error: "座標が正しくありません。" }, { status: 400 });
    }

    const reverseUrl = new URL("https://nominatim.openstreetmap.org/reverse");
    reverseUrl.searchParams.set("lat", String(latitude));
    reverseUrl.searchParams.set("lon", String(longitude));
    reverseUrl.searchParams.set("format", "jsonv2");
    reverseUrl.searchParams.set("addressdetails", "1");
    reverseUrl.searchParams.set("zoom", "18");
    reverseUrl.searchParams.set("accept-language", "ja");

    const response = await fetch(reverseUrl, {
      headers: {
        "User-Agent": "MushiMushiExpedition/1.0 (shared-web-app reverse geocoding)",
        "Accept-Language": "ja"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("住所の取得に失敗しました。");
    }

    const payload = (await response.json()) as ReverseResult;
    const address = payload.address ?? {};
    const region = resolveKnownLocation([payload.display_name ?? "", ...Object.values(address)].join(" "));
    const locationDetail = buildLocationDetail(address, region);

    return NextResponse.json(
      {
        region,
        locationDetail,
        displayName: payload.display_name ?? ""
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "住所の取得に失敗しました。"
      },
      { status: 500 }
    );
  }
}
