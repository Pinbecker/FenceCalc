import { renderToStaticMarkup } from "react-dom/server";

export function renderHookServer<TResult>(render: () => TResult): TResult {
  let result: TResult | undefined;

  function HookHost() {
    result = render();
    return null;
  }

  renderToStaticMarkup(<HookHost />);

  if (result === undefined) {
    throw new Error("Hook render did not produce a result.");
  }

  return result;
}
