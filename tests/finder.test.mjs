import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const defaultData = JSON.parse(readFileSync(new URL("../data/default-centers.json", import.meta.url), "utf8"));
function load(path, mocks = {}, globals = {}) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports, URL, URLSearchParams, AbortController, AbortSignal,
    require: name => mocks[name] ?? (name === "@/data/default-centers.json" ? defaultData : require(name)), ...globals
  }, { filename: path });
  return loadedModule.exports;
}
const distance = load("../lib/distance.ts");

function mount(geolocation, options = {}) {
  const slots = [];
  let index = 0;
  let dirty = true;
  let tree;
  let effects = [];
  const requests = [];
  const react = {
    useState(initial) {
      const id = index++;
      if (!(id in slots)) slots[id] = initial;
      return [slots[id], value => {
        const next = typeof value === "function" ? value(slots[id]) : value;
        if (!Object.is(next, slots[id])) { slots[id] = next; dirty = true; }
      }];
    },
    useRef(initial) { return react.useState({ current: initial })[0]; },
    useCallback(fn) {
      const id = index++;
      return slots[id] ??= fn;
    },
    useMemo(fn) { index++; return fn(); },
    useEffect(fn, deps) {
      const id = index++;
      if (!slots[id] || deps.some((value, i) => !Object.is(value, slots[id].deps[i]))) {
        effects.push(() => {
          slots[id]?.cleanup?.();
          slots[id] = { deps, cleanup: fn() };
        });
      }
    }
  };
  const Finder = load("../components/Finder.tsx", {
    react, "next/dynamic": () => "map-view", "@/lib/distance": distance
  }, {
    navigator: { geolocation, userAgent: "Desktop browser" },
    fetch: async url => {
      requests.push(url);
      if (url.startsWith("/api/route?")) return {
        ok: true, json: async () => ({ coordinates: [[35.6997, 51.337], [35.7, 51.337]], distanceMeters: 500, durationSeconds: 60 })
      };
      if (options.pendingCenters) return new Promise(() => {});
      return { ok: true, json: async () => ({ centers: [
        { id: "far", latitude: 35.75, longitude: 51.337, name: "Far", type: "clinic" },
        { id: "outside", latitude: 36, longitude: 51.337, name: "Outside", type: "hospital" },
        { id: "near", latitude: 35.7, longitude: 51.337, name: "Near", type: "hospital" }
      ] }) };
    }
  }).default;
  return {
    requests,
    async flush() {
      for (let pass = 0; pass < 20; pass++) {
        if (dirty) {
          dirty = false; index = 0; tree = Finder();
          const pending = effects; effects = []; pending.forEach(fn => fn());
        }
        await Promise.resolve();
      }
      function findMap(node) {
        if (!node || typeof node !== "object") return;
        if (node.type === "map-view") return node.props;
        for (const child of [node.props?.children].flat(Infinity)) {
          const result = findMap(child);
          if (result) return result;
        }
      }
      return findMap(tree);
    }
  };
}

test("entry requests location once and uses actual desktop coordinates", async () => {
  let calls = 0;
  const app = mount({ getCurrentPosition(success, _failure, options) {
    calls++;
    assert.equal(options.timeout, 15000);
    success({ coords: { latitude: 35.7, longitude: 51.337, accuracy: 30 } });
  } });
  const map = await app.flush();
  assert.equal(calls, 1);
  assert.equal(map.location.latitude, 35.7);
  assert.equal(map.radius, 10000);
  assert.deepEqual(Array.from(map.centers, c => c.id), ["near", "far"]);
  assert.match(app.requests[0], /radius=10000/);
});

test("default centers appear while permission and online data are still pending", async () => {
  const app = mount({ getCurrentPosition() {} }, { pendingCenters: true });
  const map = await app.flush();
  assert.equal(map.location.latitude, 35.6997);
  assert.equal(map.centers.length, 6);
  assert.ok(map.centers.some(center => center.type === "clinic"));
  assert.match(app.requests[0], /lat=35.6997&lon=51.337/);
});

test("each center can request a route from the displayed origin", async () => {
  const app = mount(undefined);
  let map = await app.flush();
  map.onRoute(map.centers[0]);
  map = await app.flush();
  assert.match(app.requests.at(-1), /\/api\/route\?startLat=35.6997&startLon=51.337&endLat=35.7&endLon=51.337/);
  assert.equal(map.selected.id, "near");
  assert.equal(map.route.distanceMeters, 500);
});

for (const code of [1, 2, 3, "unsupported"]) {
  test(`location failure ${code} searches around Azadi Square`, async () => {
    const app = mount(code === "unsupported" ? undefined : {
      getCurrentPosition(_success, failure) { failure({ code }); }
    });
    const map = await app.flush();
    assert.equal(map.location.latitude, 35.6997);
    assert.equal(map.location.longitude, 51.337);
    assert.match(map.locationLabel, /میدان آزادی/);
    assert.match(app.requests[0], /lat=35.6997&lon=51.337&radius=10000/);
  });
}

test("medical-centers API caps radius, filters outside centers and sorts nearest first", async () => {
  let query;
  const { GET } = load("../app/api/medical-centers/route.ts", {
    "@/lib/distance": distance
  }, {
    process: { env: {} },
    fetch: async (_url, options) => {
      query = options.body.get("data");
      return { ok: true, json: async () => ({ elements: [
        { type: "node", id: 1, lat: 35.75, lon: 51.337, tags: { amenity: "hospital" } },
        { type: "way", id: 2, center: { lat: 36, lon: 51.337 }, tags: { healthcare: "clinic" } },
        { type: "node", id: 3, lat: 35.7, lon: 51.337, tags: { healthcare: "clinic" } }
      ] }) };
    }
  });
  for (const radius of ["", "&radius=20000"]) {
    const response = await GET({ url: `http://localhost/api/medical-centers?lat=35.6997&lon=51.337${radius}` });
    const data = await response.json();
    assert.match(query, /around:10000,/);
    assert.deepEqual(data.centers.map(c => c.id), ["node/3", "node/1"]);
  }
  assert.equal((await GET({ url: "http://localhost/api/medical-centers?lon=51.337" })).status, 400);
});

test("upstream errors use verified stored centers only within the requested area", async () => {
  let calls = 0;
  const { GET } = load("../app/api/medical-centers/route.ts", { "@/lib/distance": distance }, {
    process: { env: {} },
    fetch: async () => { calls++; return { ok: false, status: 429 }; }
  });
  const response = await GET({ url: "http://localhost/api/medical-centers?lat=35.6997&lon=51.337" });
  const data = await response.json();
  assert.equal(calls, 2);
  assert.equal(data.count, 6);
  assert.ok(data.warning);
  assert.ok(data.centers.every(center => center.distanceKm <= 10));
  assert.equal(response.headers.get("cache-control"), "no-store");
  const outside = await GET({ url: "http://localhost/api/medical-centers?lat=32&lon=52" });
  assert.equal(outside.status, 503);
});

test("incomplete HTTP 200 data retries the second service instead of reporting zero centers", async () => {
  let calls = 0;
  const { GET } = load("../app/api/medical-centers/route.ts", { "@/lib/distance": distance }, {
    process: { env: {} }, fetch: async () => ({ ok: true, json: async () => ++calls === 1
      ? { elements: [], remark: "runtime error: Query timed out" }
      : { elements: [{ type: "node", id: 3, lat: 35.7, lon: 51.337, tags: { amenity: "hospital" } }] }
    })
  });
  const data = await (await GET({ url: "http://localhost/api/medical-centers?lat=35.6997&lon=51.337" })).json();
  assert.equal(calls, 2);
  assert.equal(data.count, 1);
  assert.equal(data.centers[0].id, "node/3");
  assert.equal(data.warning, undefined);
});

test("routing API validates coordinates and converts GeoJSON for the map", async () => {
  let requested;
  const { GET } = load("../app/api/route/route.ts", {}, {
    process: { env: {} }, fetch: async url => {
      requested = url;
      return { ok: true, json: async () => ({ routes: [{ distance: 900, duration: 120,
        geometry: { coordinates: [[51.337, 35.6997], [51.3569, 35.6971]] } }] }) };
    }
  });
  assert.equal((await GET({ url: "http://localhost/api/route" })).status, 400);
  const data = await (await GET({ url: "http://localhost/api/route?startLat=35.6997&startLon=51.337&endLat=35.6971&endLon=51.3569" })).json();
  assert.match(requested, /51.337,35.6997;51.3569,35.6971/);
  assert.deepEqual(data.coordinates, [[35.6997, 51.337], [35.6971, 51.3569]]);
});
