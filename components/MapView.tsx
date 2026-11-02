"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import type { MedicalCenter, RouteResult, UserLocation } from "@/types/medical-center";


const userIcon = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border:4px solid white;border-radius:50%;background:#16a34a;box-shadow:0 1px 8px #0006"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

const hospitalIcon = L.divIcon({
  className: "",
  html: '<div style="width:30px;height:30px;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#dc2626;box-shadow:0 2px 7px #0005"><span style="display:block;transform:rotate(45deg);color:white;font-weight:bold;text-align:center;line-height:24px">+</span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 30]
});

const clinicIcon = L.divIcon({
  className: "",
  html: '<div style="width:30px;height:30px;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#2563eb;box-shadow:0 2px 7px #0005"><span style="display:block;transform:rotate(45deg);color:white;font-weight:bold;text-align:center;line-height:24px">+</span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 30]
});

function Recenter({ location, radius, selected, route }: { location: UserLocation; radius: number; selected: MedicalCenter | null; route: RouteResult | null }) {
  const map = useMap();
  useEffect(() => {
    if (route) map.fitBounds(route.coordinates, { padding: [24, 24] });
    else if (selected) map.flyTo([selected.latitude, selected.longitude], 15, { duration: 0.8 });
    else map.fitBounds(L.latLng(location.latitude, location.longitude).toBounds(radius * 2), { padding: [20, 20] });
  }, [location, radius, selected, route, map]);
  return null;
}

export default function MapView({
  location, locationLabel, radius, centers, selected, route, onSelect, onRoute
}: {
  location: UserLocation;
  locationLabel: string;
  radius: number;
  centers: MedicalCenter[];
  selected: MedicalCenter | null;
  route: RouteResult | null;
  onSelect: (center: MedicalCenter) => void;
  onRoute: (center: MedicalCenter) => void;
}) {
  return (
    <MapContainer center={[location.latitude, location.longitude]} zoom={13} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Recenter location={location} radius={radius} selected={selected} route={route} />
      <Circle center={[location.latitude, location.longitude]} radius={radius} pathOptions={{ color: "#164a73", weight: 1, fillOpacity: 0.04 }} />
      <Marker position={[location.latitude, location.longitude]} icon={userIcon}>
        <Popup>{locationLabel}</Popup>
      </Marker>
      {centers.map(center => (
        <Marker
          key={center.id}
          position={[center.latitude, center.longitude]}
          icon={center.type === "hospital" ? hospitalIcon : clinicIcon}
          eventHandlers={{ click: () => onSelect(center) }}
        >
          <Popup>
            <strong>{center.name}</strong>
            <br />
            {center.type === "hospital" ? "بیمارستان" : "درمانگاه"}
            <br />
            <button onClick={() => onRoute(center)} className="mt-2 rounded-lg bg-[#164a73] px-3 py-2 text-white">نمایش مسیر تا این مرکز</button>
          </Popup>
        </Marker>
      ))}
      {route && <Polyline positions={route.coordinates} pathOptions={{ color: "#164a73", weight: 5, opacity: 0.85 }} />}
    </MapContainer>
  );
}
