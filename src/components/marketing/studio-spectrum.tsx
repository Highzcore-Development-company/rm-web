/**
 * The Studio hero's backdrop — a spectrum analyser behind the headline.
 *
 * THE IDEA IS THEIRS, THE IMPLEMENTATION IS NOT. highscore-tech-web runs a
 * three.js SoundWave scene through a capability-gated <Stage>; porting that
 * would mean adding three.js and @react-three/fiber to an app that has
 * neither, for one decorative band on one page. Their own fallback for
 * low-end devices is a static radial glow.
 *
 * So: CSS bars. No canvas, no dependency, sharp at any width, and it says
 * "music studio" before a word is read — which is the whole job their note
 * gives it.
 *
 * IT STOPS FOR ANYONE WHO ASKS FOR LESS MOTION. A row of bouncing bars is
 * exactly the kind of ambient animation prefers-reduced-motion exists for,
 * and theirs honours it too.
 *
 * The heights and delays are fixed, not random: a server and a browser
 * generating different numbers is a hydration mismatch, and nobody can tell
 * a pseudo-random spectrum from a hand-written one.
 */

/** Height as a percentage, and the delay that offsets each bar. */
const BARS = [
  38, 62, 45, 78, 55, 90, 48, 70, 35, 58, 82, 44, 66, 30, 74, 52, 88, 41, 60,
  36, 72, 50, 84, 46, 64, 33, 76, 54, 68, 40,
];

export function StudioSpectrum() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] [mask-image:linear-gradient(to_bottom,transparent_0%,black_30%,black_96%,transparent_100%)]"
    >
      {/* The glow underneath, which is their low-end fallback — kept as the
          base layer so the band reads as lit rather than as a row of sticks. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(75% 60% at 50% 100%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 72%)",
        }}
      />

      <div className="absolute inset-x-0 bottom-0 flex h-full items-end justify-center gap-[0.35%] px-2">
        {BARS.map((height, i) => (
          <span
            key={i}
            className="w-full max-w-[1.6%] origin-bottom rounded-t-sm bg-accent/35 motion-safe:animate-[spectrum_1.6s_ease-in-out_infinite]"
            style={{
              height: `${height}%`,
              animationDelay: `${(i % 10) * 0.13}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
