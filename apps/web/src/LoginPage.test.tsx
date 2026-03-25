import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginPage } from "./LoginPage.js";

describe("LoginPage", () => {
  it("renders an optional bootstrap secret field during initial setup", () => {
    const html = renderToStaticMarkup(
      <LoginPage
        bootstrapRequired
        bootstrapSecretRequired={false}
        isSubmitting={false}
        errorMessage={null}
        noticeMessage={null}
        onLogin={() => Promise.resolve(true)}
        onBootstrap={() => Promise.resolve(true)}
      />,
    );

    expect(html).toContain("Create the first owner account");
    expect(html).toContain("Bootstrap Secret (optional unless configured)");
    expect(html).toContain("Create Owner");
  });

  it("renders the standard sign-in flow without the bootstrap secret field", () => {
    const html = renderToStaticMarkup(
      <LoginPage
        bootstrapRequired={false}
        bootstrapSecretRequired={false}
        isSubmitting={false}
        errorMessage={null}
        noticeMessage={null}
        onLogin={() => Promise.resolve(true)}
        onBootstrap={() => Promise.resolve(true)}
      />,
    );

    expect(html).toContain("Log in to your workspace");
    expect(html).not.toContain("Bootstrap Secret");
    expect(html).toContain("Password recovery is manager-driven");
  });
});
