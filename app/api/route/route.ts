import { NextRequest, NextResponse } from "next/server";

const OSRM_URL = process.env.OSRM_URL || "https://router.project-osrm.org";

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  if (["startLat", "startLon", "endLat", "endLon"].some(key => !params.get(key)?.trim())) {
    return NextResponse.json({ error: "مختصات مسیر معتبر نیست." }, { status: 400 });
  }
  const startLat = Number(params.get("startLat"));
  const startLon = Number(params.get("startLon"));
  const endLat = Number(params.get("endLat"));
  const endLon = Number(params.get("endLon"));

  const values = [startLat, startLon, endLat, endLon];
  if (!values.every(Number.isFinite) || Math.abs(startLat) > 90 || Math.abs(endLat) > 90 ||
      Math.abs(startLon) > 180 || Math.abs(endLon) > 180) {
    return NextResponse.json({ error: "مختصات مسیر معتبر نیست." }, { status: 400 });
  }

  try {
    const url = `${OSRM_URL}/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("Routing service unavailable");

    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return NextResponse.json({ error: "مسیری برای این دو نقطه پیدا نشد." }, { status: 404 });
    if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration) ||
        !Array.isArray(route.geometry?.coordinates) || route.geometry.coordinates.length < 2 ||
        !route.geometry.coordinates.every((point: unknown) => Array.isArray(point) && point.length >= 2 &&
          Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90)) {
      throw new Error("Invalid route response");
    }

    return NextResponse.json({
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      // GeoJSON coordinates are [longitude, latitude]; Leaflet expects [latitude, longitude].
      coordinates: route.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon])
    });
  } catch {
    return NextResponse.json({ error: "سرویس نمایش مسیر در دسترس نیست؛ از دکمه «مسیریابی در نقشه» استفاده کنید." }, { status: 503 });
  }
}
