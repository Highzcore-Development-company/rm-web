import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Set here rather than in netlify.toml: Netlify's [[headers]] only cover files
// it serves from the CDN, and every page here is rendered on demand.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    /**
     * The portfolio screenshots live in highscore-tech-web's public storage
     * bucket, and next/image refuses a remote host that is not listed here —
     * it would be an open image proxy otherwise.
     *
     * The HOST is pinned, not just the protocol. Allowing "any https" would
     * let anybody who can edit a project row point our renderer at anything
     * on the internet.
     *
     * The images are rendered `unoptimized` anyway, so this is about the
     * allowlist rather than about resizing: routing them through our
     * optimiser would make our deploy a dependency of their pictures
     * loading, and they are already compressed webp.
     */
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ggijavqgshazbctkwmwl.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // OUR OWN bucket, which is where uploads land. Without this, a picture
      // somebody has just uploaded renders as a broken image — next/image
      // refuses any host not listed here.
      {
        protocol: "https",
        hostname: "wprdtdlvyotfdkvxexxi.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // YouTube's own thumbnails, which is where the studio's poster frames
      // come from. Pinned to the thumbnail host, not to youtube.com.
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// P2-010 — picks up src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
