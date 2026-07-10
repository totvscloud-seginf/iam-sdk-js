import { describe, expect, it } from "vitest";
import { IamClient } from "../src";

describe("config", () => {
  it("uses defaults", () => {
    const client = new IamClient();

    expect(client.config.endpointAuthn).toBe("http://localhost:9000/api");
    expect(client.config.endpointAuthzBatchEvaluate).toBe("http://localhost:443/frontend/authorizations/evaluate");
    expect(client.config.endpointCp).toBe("http://localhost:443/v1");
  });

  it("normalizes and deduplicates authz batch evaluate fallbacks", () => {
    const client = new IamClient({
      endpointAuthzBatchEvaluate: "http://primary/frontend/authorizations/evaluate/",
      endpointAuthzBatchEvaluateFallbacks: [
        "http://fallback-1/frontend/authorizations/evaluate",
        "http://primary/frontend/authorizations/evaluate",
        "http://fallback-2/frontend/authorizations/evaluate/",
      ],
    });

    expect(client.config.endpointAuthzBatchEvaluate).toBe("http://primary/frontend/authorizations/evaluate");
    expect(client.config.endpointAuthzBatchEvaluateFallbacks).toEqual([
      "http://fallback-1/frontend/authorizations/evaluate",
      "http://fallback-2/frontend/authorizations/evaluate",
    ]);
  });
});
