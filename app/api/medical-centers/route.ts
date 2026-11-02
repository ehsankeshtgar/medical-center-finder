import { NextRequest, NextResponse } from "next/server";
import type { CenterType, MedicalCenter } from "@/types/medical-center";
import { distanceKm } from "@/lib/distance";
import defaultData from "@/data/default-centers.json";

export const runtime = "nodejs";

const OVERPASS_URLS = process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

function safeNumber(value: string | null, fallback: number) {
  const parsed = value?.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lat = safeNumber(searchParams.get("lat"), NaN);
  const lon = safeNumber(searchParams.get("lon"), NaN);
  const radius = Math.min(10000, Math.max(1000, safeNumber(searchParams.get("radius"), 10000)));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "مختصات موقعیت معتبر نیست." }, { status: 400 });
  }

  const query = `
    [out:json][timeout:10];
    (
      nwr(around:${radius},${lat},${lon})["amenity"~"^(hospital|clinic)$"];
      nwr(around:${radius},${lat},${lon})["healthcare"~"^(hospital|clinic)$"];
    );
    out center tags;
  `;

  try {
    let data;
    for (const endpoint of OVERPASS_URLS) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "MedicalCenterFinder/1.0"
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(12000),
          next: { revalidate: 120 }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        // Overpass can return HTTP 200 with a timeout remark and incomplete results.
        if (!Array.isArray(payload.elements) || payload.remark) throw new Error("Incomplete Overpass response");
        data = payload;
        break;
      } catch (error) {
        console.warn(`Medical-center service failed (${endpoint}):`, error instanceof Error ? error.message : "Unknown error");
      }
    }
    if (!data) throw new Error("All medical-center services failed");
    const centers: MedicalCenter[] = [];
    const seen = new Set<string>();

    for (const element of data.elements ?? []) {
      const tags = element.tags ?? {};
      const amenity = tags.amenity;
      const healthcare = tags.healthcare;

      // Strict allow-list: only hospitals and clinics.
      let type: CenterType | null = null;
      if (amenity === "hospital" || healthcare === "hospital") type = "hospital";
      else if (amenity === "clinic" || healthcare === "clinic") type = "clinic";
      if (!type) continue;

      const latitude = element.type === "node" ? element.lat : element.center?.lat;
      const longitude = element.type === "node" ? element.lon : element.center?.lon;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const distance = distanceKm(lat, lon, latitude, longitude);
      if (distance > radius / 1000) continue;

      const key = `${element.type}/${element.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const addressParts = [
        tags["addr:city"],
        tags["addr:street"],
        tags["addr:housenumber"]
      ].filter(Boolean);

      centers.push({
        id: key,
        osmType: element.type,
        name: tags["name:fa"] || tags.name || (type === "hospital" ? "بیمارستان بدون نام" : "درمانگاه بدون نام"),
        type,
        latitude,
        longitude,
        distanceKm: distance,
        address: addressParts.join("، ") || undefined,
        phone: tags.phone || tags["contact:phone"] || undefined
      });
    }

    centers.sort((a, b) => a.distanceKm! - b.distanceKm!);
    return NextResponse.json(
      { centers, count: centers.length, source: "OpenStreetMap" },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
    );
  } catch {
    const centers = (defaultData.centers as MedicalCenter[])
      .map(center => ({ ...center, distanceKm: distanceKm(lat, lon, center.latitude, center.longitude) }))
      .filter(center => center.distanceKm <= radius / 1000)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    if (centers.length) {
      return NextResponse.json({
        centers, count: centers.length, source: "OpenStreetMap (stored subset)",
        warning: "دریافت آنلاین مراکز ممکن نشد؛ فهرست محدود ذخیره‌شده نمایش داده می‌شود و ممکن است کامل یا به‌روز نباشد."
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { error: "ارتباط با سرویس نقشه برقرار نشد. اتصال اینترنت را بررسی کنید." },
      { status: 503 }
    );
  }
}
