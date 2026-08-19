import React from "react";

export function HeroGraphic({ className = "" }: { className?: string }) {
  // Modern shield path – rounded shoulders, pointed bottom
  const shield =
    "M200 22 C172 22 90 50 42 110 C28 130 24 158 24 200 L24 230 C24 330 110 400 200 438 C290 400 376 330 376 230 L376 200 C376 158 372 130 358 110 C310 50 228 22 200 22 Z";

  // Inner shield (for double-border effect)
  const shieldInner =
    "M200 38 C174 38 100 62 56 118 C44 136 40 162 40 200 L40 228 C40 318 118 385 200 420 C282 385 360 318 360 228 L360 200 C360 162 356 136 344 118 C300 62 226 38 200 38 Z";

  // Key nodes along the shield border
  const borderNodes = [
    [200, 22],   // top peak
    [120, 36], [280, 36],  // upper shoulders
    [55, 100], [345, 100], // upper sides
    [24, 200], [376, 200], // widest points
    [28, 270], [372, 270], // lower sides
    [80, 380], [320, 380], // lower curves
    [200, 438],             // bottom point
    [145, 60], [255, 60],  // top region
    [40, 150], [360, 150], // shoulder area
  ];

  // Background scatter dots (outside & inside shield)
  const scatterDots: [number, number, number][] = [
    [20, 60, 5], [380, 80, 7], [10, 200, 4], [395, 250, 6],
    [15, 340, 5], [388, 360, 4], [30, 430, 6], [370, 430, 5],
    [80, 15, 6], [320, 10, 5], [160, 8, 4], [240, 12, 7],
    [5, 130, 8], [398, 150, 6], [50, 460, 5], [350, 455, 4],
    [100, 470, 3], [300, 475, 3], [20, 390, 4], [382, 390, 5],
    [70, 50, 3], [335, 45, 3], [8, 280, 4], [394, 300, 5],
  ];

  // Grid dots inside shield
  const gridDots: [number, number][] = [];
  for (let gx = 60; gx <= 340; gx += 28) {
    for (let gy = 50; gy <= 420; gy += 28) {
      gridDots.push([gx, gy]);
    }
  }

  // Diagonal network lines from corners to center nodes
  const networkLines: [number, number, number, number][] = [
    [200, 22, 42, 110],
    [200, 22, 358, 110],
    [42, 110, 24, 200],
    [358, 110, 376, 200],
    [24, 200, 28, 270],
    [376, 200, 372, 270],
    [28, 270, 80, 380],
    [372, 270, 320, 380],
    [80, 380, 200, 438],
    [320, 380, 200, 438],
    // cross diagonals for network feel
    [55, 100, 376, 200],
    [345, 100, 24, 200],
    [42, 110, 200, 438],
    [358, 110, 200, 438],
    [55, 100, 200, 22],
    [345, 100, 200, 22],
  ];

  return (
    <svg
      viewBox="0 0 400 460"
      className={`overflow-visible ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Glow gradient */}
        <radialGradient id="hg-glow" cx="50%" cy="48%" r="52%">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0" />
        </radialGradient>

        {/* Silver gradient for crossbar */}
        <linearGradient id="hg-silver" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A8B8CC" />
          <stop offset="40%" stopColor="#E8EEF4" />
          <stop offset="100%" stopColor="#8BA0B8" />
        </linearGradient>

        {/* Clip to shield */}
        <clipPath id="hg-clip">
          <path d={shield} />
        </clipPath>
      </defs>

      {/* ── Background ambient glow ───────────────── */}
      <ellipse cx="200" cy="230" rx="210" ry="240" fill="url(#hg-glow)" />

      {/* ── Background scatter dots (outside shield) */}
      {scatterDots.map(([cx, cy, r], i) => (
        <circle key={`sd${i}`} cx={cx} cy={cy} r={r} fill="#93C5FD" fillOpacity="0.35" />
      ))}

      {/* ── Fine grid dots inside shield ─────────── */}
      <g clipPath="url(#hg-clip)">
        {gridDots.map(([cx, cy], i) => (
          <circle key={`gd${i}`} cx={cx} cy={cy} r="1.2" fill="#3B82F6" fillOpacity="0.18" />
        ))}
      </g>

      {/* ── Network diagonal lines ────────────────── */}
      {networkLines.map(([x1, y1, x2, y2], i) => (
        <line
          key={`nl${i}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#60A5FA"
          strokeWidth="0.6"
          strokeOpacity="0.25"
          clipPath="url(#hg-clip)"
        />
      ))}

      {/* ── Outer shield border ───────────────────── */}
      <path
        d={shield}
        stroke="#3B82F6"
        strokeWidth="2.5"
        strokeOpacity="0.5"
        fill="none"
      />

      {/* ── Inner shield border ───────────────────── */}
      <path
        d={shieldInner}
        stroke="#60A5FA"
        strokeWidth="1.2"
        strokeOpacity="0.4"
        fill="none"
      />

      {/* ── Border network nodes (dots) ───────────── */}
      {borderNodes.map(([cx, cy], i) => (
        <circle
          key={`bn${i}`}
          cx={cx}
          cy={cy}
          r={i < 3 ? 5 : 3.5}
          fill="#2563EB"
          fillOpacity={i < 3 ? 0.75 : 0.55}
        />
      ))}

      {/* ── Central "A" logo ──────────────────────── */}
      {/*
          The "A" is two thick dark-blue legs + a silver metallic crossbar.
          The interior triangle of the A is hollow (white).
          Positioned at center ~y=215.
      */}
      <g transform="translate(200, 215)">
        {/* Left leg */}
        <line
          x1="-60" y1="95"
          x2="0" y2="-95"
          stroke="#1A3A8A"
          strokeWidth="28"
          strokeLinecap="round"
        />
        {/* Right leg */}
        <line
          x1="60" y1="95"
          x2="0" y2="-95"
          stroke="#1A3A8A"
          strokeWidth="28"
          strokeLinecap="round"
        />

        {/* White fill to hollow out the A interior */}
        <polygon points="0,-65 -38,65 38,65" fill="white" fillOpacity="0.95" />

        {/* Silver crossbar */}
        <rect
          x="-36" y="10"
          width="72" height="22"
          rx="4"
          fill="url(#hg-silver)"
        />

        {/* Top of A – blue cap triangle to clean up */}
        <polygon
          points="0,-95 -18,-38 18,-38"
          fill="#1A3A8A"
        />
      </g>
    </svg>
  );
}
