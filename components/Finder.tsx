"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Hospital, MapPin, Navigation, LocateFixed, RefreshCw, Route, AlertCircle, ListFilter, Map as MapIcon } from "lucide-react";
import type { MedicalCenter, RouteResult, UserLocation } from "@/types/medical-center";
import { distanceKm, formatDistance, formatDuration } from "@/lib/distance";
import defaultData from "@/data/default-centers.json";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-slate-100 text-slate-500">در حال بارگذاری نقشه...</div>
});

const DEFAULT_LOCATION: UserLocation = { latitude: 35.6997, longitude: 51.3370 };

export default function Finder() {
  const [location, setLocation] = useState<UserLocation>(DEFAULT_LOCATION);
  const [centers, setCenters] = useState<MedicalCenter[]>(defaultData.centers as MedicalCenter[]);
  const [radius, setRadius] = useState(10000);
  const [selected, setSelected] = useState<MedicalCenter | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingCenters, setLoadingCenters] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locationNotice, setLocationNotice] = useState("");
  const [usingFallback, setUsingFallback] = useState(true);
  const requestedLocation = useRef(false);
  const routeController = useRef<AbortController | null>(null);

  const sortedCenters = useMemo(() => {
    return centers
      .map(c => ({ ...c, distanceKm: distanceKm(location.latitude, location.longitude, c.latitude, c.longitude) }))
      .filter(c => c.distanceKm <= radius / 1000)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [centers, location, radius]);

  useEffect(() => {
    const controller = new AbortController();
    const findCenters = async () => {
      setLoadingCenters(true);
      setError("");
      setNotice("");
      setRoute(null);
      setSelected(null);
      setLoadingRoute(false);
      setCenters(defaultData.centers as MedicalCenter[]);
      try {
        const params = new URLSearchParams({
          lat: String(location.latitude), lon: String(location.longitude), radius: String(radius)
        });
        const response = await fetch(`/api/medical-centers?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error || "دریافت مراکز ناموفق بود.");
        setCenters(data.centers ?? []);
        setNotice(data.warning || (!data.centers?.length ? "در این محدوده بیمارستان یا درمانگاهی در داده‌های نقشه پیدا نشد." : ""));
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "خطای نامشخص در دریافت مراکز.");
      } finally {
        if (!controller.signal.aborted) setLoadingCenters(false);
      }
    };
    void findCenters();
    return () => {
      controller.abort();
      routeController.current?.abort();
    };
  }, [location, radius]);

  const requestCurrentLocation = useCallback(() => {
    setError("");
    setLocationNotice("");

    const applyFallback = () => {
      setLoadingLocation(false);
      setLocation(DEFAULT_LOCATION);
      setUsingFallback(true);
      setLocationNotice("موقعیت شما در دسترس نیست؛ مراکز اطراف میدان آزادی تهران نمایش داده می‌شوند. برای دریافت موقعیت خود دوباره تلاش کنید.");
    };

    if (!navigator.geolocation) {
      applyFallback();
      return;
    }

    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLoadingLocation(false);

        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setLocation(loc);
        setUsingFallback(false);
        setLocationNotice("مراکز بر اساس موقعیت فعلی شما، از نزدیک‌ترین فاصله نمایش داده می‌شوند.");
      },
      applyFallback,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    if (requestedLocation.current) return;
    requestedLocation.current = true;
    requestCurrentLocation();
  }, [requestCurrentLocation]);

  const changeRadius = (value: number) => {
    setRadius(value);
  };

  const chooseCenter = (center: MedicalCenter) => {
    routeController.current?.abort();
    setLoadingRoute(false);
    setSelected(center);
    setRoute(null);
  };

  const calculateRoute = async (center: MedicalCenter) => {
    chooseCenter(center);
    const controller = new AbortController();
    routeController.current = controller;
    setLoadingRoute(true);
    setError("");
    try {
      const params = new URLSearchParams({
        startLat: String(location.latitude),
        startLon: String(location.longitude),
        endLat: String(center.latitude),
        endLon: String(center.longitude)
      });
      const response = await fetch(`/api/route?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "محاسبه مسیر ناموفق بود.");
      setRoute(data);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "خطا در محاسبه مسیر.");
    } finally {
      if (!controller.signal.aborted) setLoadingRoute(false);
    }
  };

  const externalRouteUrl = (center: MedicalCenter) =>
    `https://www.google.com/maps/dir/?api=1&origin=${location.latitude},${location.longitude}&destination=${center.latitude},${center.longitude}&travelmode=driving`;

  const mapLocation = location;

  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#164a73]">
              <Hospital size={25} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">مراکز درمانی نزدیک من</h1>
              <p className="text-xs text-slate-500">یافتن بیمارستان‌ها و درمانگاه‌های اطراف شما</p>
            </div>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:inline-flex">نسخه آزمایشی</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-3 sm:p-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="order-2 space-y-4 lg:order-1">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 font-bold text-slate-900">موقعیت مکانی</h2>
            <p className="mb-4 text-sm leading-6 text-slate-500">
              مراکز اطراف میدان آزادی تهران از ابتدا نمایش داده می‌شوند. با تأیید مجوز موقعیت، مراکز نزدیک شما تا شعاع ۱۰ کیلومتر نمایش داده خواهند شد.
            </p>
            <button onClick={requestCurrentLocation} disabled={loadingLocation}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#164a73] px-4 py-3 font-semibold text-white transition hover:bg-[#103b5d] disabled:opacity-60">
              {loadingLocation ? <RefreshCw className="animate-spin" size={18} /> : <LocateFixed size={18} />}
              {loadingLocation ? "در حال دریافت موقعیت..." : "نمایش مراکز نزدیک من"}
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">محدوده جستجو</h2>
              <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-sm font-bold text-[#164a73]">{radius / 1000} کیلومتر</span>
            </div>
            <input aria-label="شعاع جستجو" type="range" min="1000" max="10000" step="1000" value={radius}
              onChange={e => changeRadius(Number(e.target.value))} className="w-full accent-[#164a73]" />
            <div className="flex justify-between text-xs text-slate-400"><span>۱ کیلومتر</span><span>۱۰ کیلومتر</span></div>
          </section>

          {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700"><AlertCircle className="mt-1 shrink-0" size={17} />{error}</div>}
          {locationNotice && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-800">{locationNotice}</div>}
          {notice && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">{notice}</div>}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div>
                <h2 className="font-bold text-slate-900">مراکز درمانی</h2>
                <p role="status" className="mt-1 text-xs text-slate-500">{sortedCenters.length} مرکز{loadingCenters ? " · در حال به‌روزرسانی..." : " پیدا شد"}</p>
              </div>
              <ListFilter size={19} className="text-slate-400" />
            </div>
            <div className="max-h-[440px] divide-y divide-slate-100 overflow-y-auto">
              {sortedCenters.map(center => (
                <div key={center.id}>
                <button onClick={() => chooseCenter(center)}
                  className={`block w-full p-4 text-right transition hover:bg-blue-50 ${selected?.id === center.id ? "bg-blue-50" : "bg-white"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-xl p-2 ${center.type === "hospital" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
                      <Hospital size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800">{center.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{center.type === "hospital" ? "بیمارستان" : "درمانگاه"}</p>
                      <p className="mt-2 text-xs font-medium text-[#164a73]">{center.distanceKm !== undefined ? formatDistance(center.distanceKm) : ""}</p>
                      {center.address && <p className="mt-1 text-xs text-slate-400">{center.address}</p>}
                    </div>
                    <MapPin size={17} className="shrink-0 text-slate-400" />
                  </div>
                </button>
                <div className="flex gap-2 px-4 pb-3">
                  <button onClick={() => void calculateRoute(center)} disabled={loadingRoute && selected?.id === center.id}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#164a73] px-2 py-2 text-xs text-white disabled:opacity-60">
                    <Route size={14} /> {loadingRoute && selected?.id === center.id ? "در حال مسیریابی..." : "نمایش مسیر"}
                  </button>
                  <a href={externalRouteUrl(center)} target="_blank" rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-700">
                    <Navigation size={14} /> مسیریابی در نقشه
                  </a>
                </div>
                </div>
              ))}
              {!loadingCenters && sortedCenters.length === 0 && (
                <div className="p-6 text-center text-sm leading-6 text-slate-400">
                  {error ? "دریافت اطلاعات مراکز با خطا روبه‌رو شد؛ دوباره تلاش کنید." : "در این شعاع مرکز درمانی ثبت‌شده‌ای پیدا نشد."}
                </div>
              )}
            </div>
          </section>

          {selected && (
            <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
              <h3 className="font-bold text-slate-900">{selected.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{selected.type === "hospital" ? "بیمارستان" : "درمانگاه"} · {formatDistance(selected.distanceKm ?? 0)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => void calculateRoute(selected)} disabled={loadingRoute}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#164a73] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {loadingRoute ? <RefreshCw size={16} className="animate-spin" /> : <Route size={16} />}
                  نمایش مسیر
                </button>
                <a href={externalRouteUrl(selected)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">
                  <Navigation size={16} /> مسیریابی
                </a>
              </div>
              {route && (
                <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                  مسیر رانندگی: {(route.distanceMeters / 1000).toFixed(1)} کیلومتر · {formatDuration(route.durationSeconds)}
                </div>
              )}
            </section>
          )}

          <p className="px-1 text-[11px] leading-5 text-slate-400">
            اطلاعات مراکز از OpenStreetMap است. فهرست اولیه شامل چند مرکز ذخیره‌شده است و با اتصال به سرویس تکمیل می‌شود؛ ممکن است همه مراکز را پوشش ندهد. مبنای مسیریابی، موقعیت مشخص‌شده روی نقشه است.
          </p>
        </aside>

        <section className="order-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:order-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><MapIcon size={18} /> نقشه مراکز درمانی</div>
            <button onClick={requestCurrentLocation} disabled={loadingLocation} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60">
              <Crosshair size={15} /> موقعیت من
            </button>
          </div>
          <div className="h-[430px] sm:h-[560px] lg:h-[calc(100vh-150px)] lg:min-h-[560px]">
            <MapView location={mapLocation} locationLabel={usingFallback ? "موقعیت پیش‌فرض: میدان آزادی تهران" : "موقعیت مبنای جستجو"} radius={radius} centers={sortedCenters} selected={selected} route={route} onSelect={chooseCenter} onRoute={center => void calculateRoute(center)} />
          </div>
        </section>
      </div>
    </main>
  );
}
