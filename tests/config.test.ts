import { describe, expect, it } from "vitest";
import { IamClient } from "../src";

describe("config", () => {
  it("uses defaults", () => {
    const client = new IamClient();

    expect(client.config.endpointAuthn).toBe("http://localhost:9000/api");
    expect(client.config.endpointAuthzFrontend).toBe("http://localhost:443/frontend/authorizations");
    expect(client.config.endpointCp).toBe("http://localhost:443/v1");
  });

  it("normalizes and deduplicates authz frontend fallbacks", () => {
    const client = new IamClient({
      endpointAuthzFrontend: "http://primary/frontend/authorizations/",
      endpointAuthzFrontendFallbacks: [
        "http://fallback-1/frontend/authorizations",
        "http://primary/frontend/authorizations",
        "http://fallback-2/frontend/authorizations/",
      ],
    });

    expect(client.config.endpointAuthzFrontend).toBe("http://primary/frontend/authorizations");
    expect(client.config.endpointAuthzFrontendFallbacks).toEqual([
      "http://fallback-1/frontend/authorizations",
      "http://fallback-2/frontend/authorizations",
    ]);
  });
});
