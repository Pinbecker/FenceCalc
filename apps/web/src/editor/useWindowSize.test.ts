import { afterEach, describe, expect, it, vi } from "vitest";

async function loadUseWindowSize() {
  vi.resetModules();

  const setSize = vi.fn();
  let cleanup: (() => void) | void;
  const windowMock = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  vi.doMock("react", () => ({
    useEffect: (effect: () => void | (() => void)) => {
      cleanup = effect();
    },
    useState: (initialValue: unknown) => [
      typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue,
      setSize
    ]
  }));
  vi.stubGlobal("window", windowMock);

  const module = await import("./useWindowSize.js");
  return {
    ...module,
    setSize,
    windowMock,
    runCleanup: () => cleanup?.()
  };
}

describe("useWindowSize", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
    vi.unstubAllGlobals();
  });

  it("tracks the current window size and listens for resize events", async () => {
    const { useWindowSize, setSize, windowMock, runCleanup } = await loadUseWindowSize();

    expect(useWindowSize()).toEqual({ width: 1280, height: 720 });
    expect(windowMock.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));

    windowMock.innerWidth = 1440;
    windowMock.innerHeight = 900;
    const resizeHandler = windowMock.addEventListener.mock.calls[0]?.[1] as () => void;
    resizeHandler();

    expect(setSize).toHaveBeenCalledWith({ width: 1440, height: 900 });

    runCleanup();
    expect(windowMock.removeEventListener).toHaveBeenCalledWith("resize", resizeHandler);
  });
});
