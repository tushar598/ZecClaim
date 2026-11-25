import type { MetadataRoute } from "next";

/** Claim links, organizer consoles and the API are private; proof portals are meant to be shared. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/claim/", "/admin/", "/api/"] },
  };
}
