import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Drives public/sw.js in node: shim `self`, `caches` and `fetch`, import the
 * worker, and dispatch fake fetch events at its public seam — the promise
 * handed to event.respondWith() is exactly what the browser would await.
 *
 * Behavior under test (audit finding 1): an offline navigation must serve the
 * requested URL from the cache when possible and the offline page otherwise —
 * never the shell "/" HTML at the wrong URL — and a successful navigation
 * must not keep overwriting the single "/" cache key.
 */

type FetchListener = (event: FakeFetchEvent | FakeInstallEvent) => void;

const ORIGIN = "https://saasmath.test";

/** Real caches store absolute URLs and hand out fresh bodies per match. */
function cacheKey(req: Request | string): string {
  if (typeof req !== "string") return req.url;
  return req.startsWith("/") ? `${ORIGIN}${req}` : req;
}

class FakeCache {
  private map = new Map<string, string>();

  async match(req: Request | string): Promise<Response | undefined> {
    const body = this.map.get(cacheKey(req));
    return body === undefined ? undefined : new Response(body);
  }
  async put(req: Request | string, res: Response): Promise<void> {
    this.map.set(cacheKey(req), await res.text());
  }
  async addAll(urls: string[]): Promise<void> {
    for (const url of urls) {
      this.map.set(cacheKey(url), `cached:${url}`);
    }
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
  async delete(req: Request | string): Promise<boolean> {
    return this.map.delete(cacheKey(req));
  }
}

const cachesByName = new Map<string, FakeCache>();
const listeners = new Map<string, FetchListener>();

class FakeFetchEvent {
  readonly request: Request;
  private withResponse: Promise<Response> | null = null;

  constructor(url: string, mode: "navigate" | "basic") {
    const request = new Request(url);
    if (mode === "navigate") {
      // undici Request accepts only cors/no-cors/same-origin as modes; the
      // worker keys its strategy on request.mode, so pin it like the browser.
      Object.defineProperty(request, "mode", { value: "navigate" });
    }
    this.request = request;
  }

  respondWith(p: Promise<Response>): void {
    this.withResponse = p;
  }

  get response(): Promise<Response> | null {
    return this.withResponse;
  }
}

class FakeInstallEvent {
  readonly waitUntilPromises: Promise<unknown>[] = [];
  waitUntil(p: Promise<unknown>): void {
    this.waitUntilPromises.push(p);
  }
  get done(): Promise<unknown> {
    return Promise.all(this.waitUntilPromises);
  }
}

async function navigateOffline(url: string): Promise<Response | null> {
  const event = new FakeFetchEvent(url, "navigate");
  listeners.get("fetch")?.(event);
  return event.response;
}

beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  }));
  vi.stubGlobal("caches", {
    open: async (name: string) => {
      let cache = cachesByName.get(name);
      if (!cache) {
        cache = new FakeCache();
        cachesByName.set(name, cache);
      }
      return cache;
    },
    keys: async () => [...cachesByName.keys()],
    delete: async (name: string) => cachesByName.delete(name),
  });
  vi.stubGlobal("self", {
    location: { origin: ORIGIN },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    addEventListener: (type: string, fn: FetchListener) => listeners.set(type, fn),
  });

  // sw.js is a classic worker script (no exports), so it cannot be imported
  // as a module: evaluate its source against the stubbed globals above —
  // exactly what the browser does, registering its listeners on `self`.
  const workerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  new Function(workerSource)();

  const install = new FakeInstallEvent();
  listeners.get("install")?.(install);
  await install.done;
});

const SHELL = "saasmath-shell-v1-shell";

describe("sw.js navigation fallback", () => {
  it("serves the precached page for an offline navigation to /", async () => {
    const res = await navigateOffline("https://saasmath.test/");
    expect(await res?.text()).toBe("cached:/");
  });

  it("serves offline.html for an offline navigation to any other page", async () => {
    const res = await navigateOffline("https://saasmath.test/anak/latihan");
    expect(await res?.text()).toBe("cached:/offline.html");
  });

  it("does not overwrite the precached / on successful navigations", async () => {
    const shell = cachesByName.get(SHELL);
    const shellBodyBefore = await shell?.match("/").then((r) => r?.text());
    expect(shellBodyBefore).toBe("cached:/");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (req: Request) => new Response(`fresh:${req.url}`, { status: 200 })),
    );
    const event = new FakeFetchEvent("https://saasmath.test/anak", "navigate");
    listeners.get("fetch")?.(event);
    const res = await event.response;
    expect(await res?.text()).toBe("fresh:https://saasmath.test/anak");

    // The shell entry must be untouched: overwriting it with some other
    // page's HTML is what made offline navigations serve the wrong page.
    const shellBodyAfter = await shell?.match("/").then((r) => r?.text());
    expect(shellBodyAfter).toBe("cached:/");
  });
});
