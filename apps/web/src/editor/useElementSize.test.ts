import { afterEach, describe, expect, it, vi } from "vitest";

async function loadUseElementSize(options: {
  element: { clientWidth: number; clientHeight: number } | null;
  hasResizeObserver: boolean;
}) {
  vi.resetModules();

  const setSize = vi.fn();
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  let cleanup: (() => void) | void;
  let observerCallback: (() => void) | null = null;
  const observe = vi.fn();
  const disconnect = vi.fn();

  vi.doMock("react", () => ({
    useEffect: (effect: () => void | (() => void)) => {
      cleanup = effect();
    },
    useRef: () => ({ current: options.element }),
    useState: () => [{ width: 0, height: 0 }, setSize]
  }));

  vi.stubGlobal("window", { addEventListener, removeEventListener });
  if (options.hasResizeObserver) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observerCallback = callback;
        }
        observe = observe;
        disconnect = disconnect;
      }
    );
  } else {
    vi.stubGlobal("ResizeObserver", undefined);
  }

  const module = await import("./useElementSize.js");
  return {
    ...module,
    setSize,
    addEventListener,
    removeEventListener,
    runCleanup: () => cleanup?.(),
    triggerObserver: () => observerCallback?.(),
    observe,
    disconnect
  };
}

describe("useElementSize", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("react");
    vi.unstubAllGlobals();
  });

  it("measures the element and falls back to window resize events when ResizeObserver is unavailable", async () => {
    const element = { clientWidth: 640, clientHeight: 480 };
    const { useElementSize, setSize, addEventListener, removeEventListener, runCleanup } = await loadUseElementSize({
      element,
      hasResizeObserver: false
    });

    const result = useElementSize<HTMLDivElement>();
    expect(result.ref.current).toBe(element);

    const initialUpdater = setSize.mock.calls[0]?.[0] as (current: { width: number; height: number }) => unknown;
    expect(initialUpdater({ width: 0, height: 0 })).toEqual({ width: 640, height: 480 });
    expect(addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));

    element.clientWidth = 700;
    element.clientHeight = 500;
    const resizeHandler = addEventListener.mock.calls[0]?.[1] as () => void;
    resizeHandler();

    const resizedUpdater = setSize.mock.calls[1]?.[0] as (current: { width: number; height: number }) => unknown;
    expect(resizedUpdater({ width: 640, height: 480 })).toEqual({ width: 700, height: 500 });

    runCleanup();
    expect(removeEventListener).toHaveBeenCalledWith("resize", resizeHandler);
  });

  it("uses ResizeObserver when available", async () => {
    const element = { clientWidth: 800, clientHeight: 600 };
    const { useElementSize, setSize, triggerObserver, observe, disconnect, runCleanup } = await loadUseElementSize({
      element,
      hasResizeObserver: true
    });

    useElementSize<HTMLDivElement>();

    expect(observe).toHaveBeenCalledWith(element);

    element.clientWidth = 900;
    element.clientHeight = 650;
    triggerObserver();

    const resizeUpdater = setSize.mock.calls[1]?.[0] as (current: { width: number; height: number }) => unknown;
    expect(resizeUpdater({ width: 800, height: 600 })).toEqual({ width: 900, height: 650 });

    runCleanup();
    expect(disconnect).toHaveBeenCalled();
  });
});
