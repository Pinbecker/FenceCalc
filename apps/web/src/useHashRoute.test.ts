import { afterEach, describe, expect, it, vi } from "vitest";

async function loadUseHashRoute(initialHash: string) {
  vi.resetModules();

  const setLocation = vi.fn();
  let hashChangeHandler: (() => void) | null = null;
  const location = { hash: initialHash };
  const windowMock = {
    location,
    addEventListener: vi.fn((event: string, handler: () => void) => {
      if (event === "hashchange") {
        hashChangeHandler = handler;
      }
    }),
    removeEventListener: vi.fn()
  };

  vi.doMock("react", () => ({
    useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
    useEffect: (effect: () => void | (() => void)) => effect(),
    useMemo: <T,>(factory: () => T) => factory(),
    useState: (initialValue: unknown) => [
      typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue,
      setLocation
    ]
  }));
  vi.stubGlobal("window", windowMock);

  const module = await import("./useHashRoute.js");
  return {
    ...module,
    hashChangeHandler: () => hashChangeHandler?.(),
    setLocation,
    windowMock
  };
}

describe("useHashRoute", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
    vi.unstubAllGlobals();
  });

  it("parses the current hash and responds to hash changes", async () => {
    const { useHashRoute, hashChangeHandler, setLocation, windowMock } = await loadUseHashRoute(
      "#/drawings?status=archived"
    );

    const route = useHashRoute();
    expect(route.route).toBe("drawings");
    expect(route.query).toEqual({ status: "archived" });
    expect(windowMock.addEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));

    windowMock.location.hash = "#/unknown?drawingId=123";
    hashChangeHandler();

    expect(setLocation).toHaveBeenCalledWith({
      route: "dashboard",
      query: { drawingId: "123" }
    });
  });

  it("builds hashes for navigation and reuses the current location when navigating to the same hash", async () => {
    const { useHashRoute, setLocation, windowMock } = await loadUseHashRoute("#/editor?drawingId=123");

    const route = useHashRoute();

    route.navigate("editor", { drawingId: "123", empty: "" });
    expect(setLocation).toHaveBeenCalledWith({
      route: "editor",
      query: { drawingId: "123" }
    });

    route.navigate("admin", { tab: "users" });
    expect(windowMock.location.hash).toBe("#/admin?tab=users");
  });
});
