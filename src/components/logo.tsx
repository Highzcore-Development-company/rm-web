import Image from "next/image";
import Link from "next/link";

/**
 * P2-001 — the wordmark.
 *
 * Both variants are rendered and CSS picks one. That is deliberate: the theme
 * lives in `data-theme` on <html> and is resolved by CSS, not React, so a
 * JS-chosen `src` would render the wrong logo on the server and swap after
 * hydration — a visible flash on every cold load. Letting CSS decide means the
 * correct logo is painted on the first frame.
 *
 * The cost is one extra image request. Both are small and cached, and `priority`
 * on the dark variant covers the common case since dark is the default theme.
 *
 * Selectors mirror globals.css exactly. Light applies when the system prefers
 * light AND the user has not forced dark, or when they have explicitly chosen
 * light. Any change there has to be made in both places.
 */
export function Logo({
  className = "",
  width = 150,
  priority = false,
}: {
  className?: string;
  width?: number;
  priority?: boolean;
}) {
  // The source is 2000x433, so height follows at the same ratio.
  const height = Math.round((width * 433) / 2000);

  return (
    <>
      <Image
        src="/logo-dark.png"
        alt="Highzcore"
        width={width}
        height={height}
        priority={priority}
        className={`logo-dark ${className}`}
      />
      <Image
        src="/logo-light.png"
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        className={`logo-light ${className}`}
      />
    </>
  );
}

/** The wordmark as a link home. The header's usual shape. */
export function LogoLink({
  className = "",
  width = 150,
  priority = false,
}: {
  className?: string;
  width?: number;
  priority?: boolean;
}) {
  return (
    <Link
      href="/"
      aria-label="Highzcore home"
      className={`inline-flex items-center ${className}`}
    >
      <Logo width={width} priority={priority} />
    </Link>
  );
}
