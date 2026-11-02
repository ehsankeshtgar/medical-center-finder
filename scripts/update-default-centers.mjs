import { mkdir, writeFile } from "node:fs/promises";

// A small verified starter list; live Overpass results replace it when available.
const places = ["way/439260578", "way/439260579", "node/4731480122", "way/438520347", "way/191445129", "way/671615919"];
const centers = [];
for (const place of places) {
  const [type, id] = place.split("/");
  const url = `https://www.openstreetmap.org/api/0.6/${type}/${id}${type === "way" ? "/full" : ""}.json`;
  const response = await fetch(url, {
    headers: { "User-Agent": "MedicalCenterFinder/1.0 (default-area data refresh)" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`${place}: HTTP ${response.status}`);
  const { elements } = await response.json();
  const feature = elements.find(element => element.type === type && String(element.id) === id);
  const nodes = elements.filter(element => element.type === "node");
  const tags = feature.tags;
  const centerType = tags.amenity ?? tags.healthcare;
  if (!["hospital", "clinic"].includes(centerType) || !nodes.length) throw new Error(`Invalid medical center: ${place}`);
  centers.push({
    id: place, osmType: type, name: tags["name:fa"] || tags.name, type: centerType,
    latitude: (Math.min(...nodes.map(node => node.lat)) + Math.max(...nodes.map(node => node.lat))) / 2,
    longitude: (Math.min(...nodes.map(node => node.lon)) + Math.max(...nodes.map(node => node.lon))) / 2,
    address: [tags["addr:city"], tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join("، ") || undefined
  });
}
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(new URL("../data/default-centers.json", import.meta.url), JSON.stringify({
  source: "OpenStreetMap", license: "ODbL-1.0", attribution: "https://www.openstreetmap.org/copyright",
  retrievedAt: new Date().toISOString(), centers
}, null, 2) + "\n");
console.log(`Saved ${centers.length} verified medical centers.`);
