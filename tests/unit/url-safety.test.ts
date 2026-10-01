import { describe, expect, it } from "vitest";

import { assertSafeUrl, isPrivateAddress, safeLookup, UnsafeUrlError } from "@/server/link-preview/url-safety";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1"])(
    "refuse %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])("accepte %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("assertSafeUrl", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com",
    "http://localhost:3000",
    "http://api.localhost/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "https://user:pass@example.com/",
    "https://example.com:22/",
    "pas une url",
  ])("refuse %s", (url) => {
    expect(() => assertSafeUrl(url)).toThrow(UnsafeUrlError);
  });

  it("accepte une URL publique", () => {
    expect(assertSafeUrl("https://www.booking.com/hotel/pt/x.html").hostname).toBe("www.booking.com");
  });
});

describe("safeLookup", () => {
  it("bloque un nom qui résout vers une adresse locale", async () => {
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      safeLookup("localhost", {}, (err) => resolve(err)),
    );
    expect(error?.code).toBe("EUNSAFEADDRESS");
  });
});
