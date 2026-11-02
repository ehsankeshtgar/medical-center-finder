export type CenterType = "hospital" | "clinic";

export interface MedicalCenter {
  id: string;
  osmType: "node" | "way" | "relation";
  name: string;
  type: CenterType;
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  distanceKm?: number;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: [number, number][];
}
