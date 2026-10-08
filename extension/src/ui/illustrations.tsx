// Original flat illustrations for the "quiet forest" look: pine trees,
// clouds, soft hills and a small bunny who studies along with the learner.
// Pure SVG, so they are crisp at any size and need no image files.

import type { ReactNode } from "react";


const PINE_GREENS = ["#5f8f7a", "#4f8069", "#3f6e5a"];


function Pine({
  x,
  base,
  height,
  shade = 0
}: {
  x: number;
  base: number;
  height: number;
  shade?: number;
}) {

  const w = height * 0.62;
  const colour = PINE_GREENS[shade % PINE_GREENS.length];
  const tiers = [0, 0.3, 0.55];

  return (
    <g>
      <rect
        x={x - height * 0.045}
        y={base - height * 0.16}
        width={height * 0.09}
        height={height * 0.16}
        fill="#8a6a4f"
        rx={1}
      />
      {tiers.map((t, i) => {
        const top = base - height + t * height;
        const tierW = w * (0.62 + i * 0.19);
        const tierH = height * 0.48;
        return (
          <path
            key={i}
            d={`M${x},${top} L${x + tierW / 2},${top + tierH} L${x - tierW / 2},${top + tierH} Z`}
            fill={colour}
          />
        );
      })}
    </g>
  );

}


function Cloud({
  x,
  y,
  scale = 1
}: {
  x: number;
  y: number;
  scale?: number;
}) {

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill="#ffffff" opacity="0.9">
      <ellipse cx="0" cy="8" rx="22" ry="9" />
      <ellipse cx="-9" cy="3" rx="11" ry="9" />
      <ellipse cx="7" cy="0" rx="13" ry="11" />
    </g>
  );

}


// A bunny sitting with an open book. (x, y) is where it sits.
function ReadingBunny({
  x,
  y,
  scale = 1
}: {
  x: number;
  y: number;
  scale?: number;
}) {

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* ears */}
      <ellipse cx="-6" cy="-40" rx="4.5" ry="13" fill="#fffdf8" stroke="#cfc5b3" strokeWidth="1.2" transform="rotate(-8 -6 -40)" />
      <ellipse cx="-6" cy="-40" rx="2" ry="9" fill="#f2c6c3" transform="rotate(-8 -6 -40)" />
      <ellipse cx="6" cy="-41" rx="4.5" ry="13" fill="#fffdf8" stroke="#cfc5b3" strokeWidth="1.2" transform="rotate(10 6 -41)" />
      <ellipse cx="6" cy="-41" rx="2" ry="9" fill="#f2c6c3" transform="rotate(10 6 -41)" />
      {/* body and head */}
      <ellipse cx="0" cy="-8" rx="14" ry="12" fill="#fffdf8" stroke="#cfc5b3" strokeWidth="1.2" />
      <circle cx="0" cy="-24" r="11" fill="#fffdf8" stroke="#cfc5b3" strokeWidth="1.2" />
      {/* face */}
      <circle cx="-4" cy="-25" r="1.4" fill="#3b4742" />
      <circle cx="4" cy="-25" r="1.4" fill="#3b4742" />
      <ellipse cx="-6.5" cy="-21" rx="2" ry="1.2" fill="#f2c6c3" />
      <ellipse cx="6.5" cy="-21" rx="2" ry="1.2" fill="#f2c6c3" />
      <path d="M-1.5,-21.5 Q0,-20 1.5,-21.5" stroke="#3b4742" strokeWidth="1" fill="none" strokeLinecap="round" />
      {/* open book */}
      <path d="M-13,-10 L0,-6 L13,-10 L13,0 L0,4 L-13,0 Z" fill="#bd533a" />
      <path d="M-11,-9 L0,-5.5 L11,-9 L11,-1 L0,2.5 L-11,-1 Z" fill="#fbf8f1" />
      <line x1="0" y1="-5.5" x2="0" y2="2.5" stroke="#d4c8b0" strokeWidth="1" />
      {/* paws */}
      <ellipse cx="-9" cy="-3" rx="3.5" ry="2.6" fill="#fffdf8" stroke="#cfc5b3" strokeWidth="1" />
      <ellipse cx="9" cy="-3" rx="3.5" ry="2.6" fill="#fffdf8" stroke="#cfc5b3" strokeWidth="1" />
    </g>
  );

}


function Flower({
  x,
  y,
  colour = "#e08a73"
}: {
  x: number;
  y: number;
  colour?: string;
}) {

  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - 7} stroke="#5f8f7a" strokeWidth="1.2" />
      <circle cx={x} cy={y - 8} r="2.4" fill={colour} />
    </g>
  );

}


/**
 * A landscape banner: sky, clouds, hills, pines and the bunny.
 * `wide` lays the same scene out for a full-width banner (dashboard) instead
 * of zooming in, so nothing collides with text above it.
 * `children` are drawn on top (e.g. text positioned with SVG).
 */
export function ForestScene({
  bunny = true,
  wide = false,
  children
}: {
  bunny?: boolean;
  wide?: boolean;
  children?: ReactNode;
}) {

  const width =
    wide ? 1000 : 400;

  // Horizontal stretch for hills and ground drawn on a 400-wide grid.
  const stretch =
    width / 400;

  const trees = wide
    ? [
      { x: 40, h: 62, s: 0 }, { x: 72, h: 84, s: 1 }, { x: 108, h: 56, s: 2 },
      { x: 150, h: 70, s: 0 }, { x: 230, h: 48, s: 2 },
      { x: 760, h: 52, s: 2 }, { x: 830, h: 72, s: 0 }, { x: 872, h: 88, s: 1 },
      { x: 912, h: 60, s: 2 }, { x: 958, h: 76, s: 0 }
    ]
    : [
      { x: 22, h: 58, s: 0 }, { x: 46, h: 74, s: 1 }, { x: 74, h: 50, s: 2 },
      { x: 318, h: 52, s: 2 }, { x: 344, h: 78, s: 1 }, { x: 374, h: 60, s: 0 }
    ];

  const clouds = wide
    ? [{ x: 120, y: 30, s: 1 }, { x: 640, y: 26, s: 0.9 }, { x: 900, y: 40, s: 0.7 }]
    : [{ x: 300, y: 20, s: 0.9 }, { x: 360, y: 46, s: 0.6 }];

  const flowers = wide
    ? [{ x: 300, y: 136 }, { x: 318, y: 139, c: "#e6b450" }, { x: 640, y: 136 }, { x: 700, y: 138, c: "#e6b450" }]
    : [{ x: 110, y: 134 }, { x: 124, y: 138, c: "#e6b450" }, { x: 292, y: 136 }];

  return (
    <svg
      className="scene"
      viewBox={`0 0 ${width} 150`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe3dc" />
          <stop offset="1" stopColor="#eef4ef" />
        </linearGradient>
      </defs>

      <rect width={width} height="150" fill="url(#sky)" />

      {clouds.map(c => (
        <Cloud key={`${c.x}-${c.y}`} x={c.x} y={c.y} scale={c.s} />
      ))}

      <g transform={`scale(${stretch} 1)`}>
        {/* far hills */}
        <path d="M0,104 C60,84 120,92 180,98 C240,104 300,82 400,92 L400,150 L0,150 Z" fill="#c7dacd" />
        {/* near hills */}
        <path d="M0,118 C80,106 150,116 220,114 C290,112 340,104 400,110 L400,150 L0,150 Z" fill="#b3cfbf" />
      </g>

      {/* trees, back to front */}
      {trees.map(t => (
        <Pine key={t.x} x={t.x} base={126 - (t.s === 2 ? 3 : 0)} height={t.h} shade={t.s} />
      ))}

      {/* ground */}
      <rect x="0" y="126" width={width} height="24" fill="#d9e5d4" />
      <path d={`M0,126 L${width},126`} stroke="#c2d6c4" strokeWidth="2" />

      {flowers.map(f => (
        <Flower key={f.x} x={f.x} y={f.y} colour={f.c} />
      ))}

      {bunny && <ReadingBunny x={width / 2} y={136} scale={1.15} />}

      {children}
    </svg>
  );

}


// The bunny on its own, for the mentor's avatar.
export function BunnyAvatar({
  size = 40
}: {
  size?: number;
}) {

  return (
    <svg width={size} height={size} viewBox="-24 -56 48 64" aria-hidden="true">
      <circle cx="0" cy="-22" r="27" fill="#dce9e0" />
      <ReadingBunny x={0} y={4} scale={1} />
    </svg>
  );

}


// Small potted plant, a corner decoration.
export function Sprout({
  size = 36
}: {
  size?: number;
}) {

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20,26 C20,18 14,14 8,14 C10,20 14,24 20,26 Z" fill="#6f9c89" />
      <path d="M20,24 C20,14 26,9 33,9 C31,17 26,22 20,24 Z" fill="#4f8069" />
      <line x1="20" y1="26" x2="20" y2="30" stroke="#4f8069" strokeWidth="1.5" />
      <path d="M12,29 L28,29 L26,38 L14,38 Z" fill="#d9825f" />
      <rect x="11" y="28" width="18" height="3" rx="1" fill="#c96f4f" />
    </svg>
  );

}


// The app's mark: a single pine.
export function PineMark({
  size = 22
}: {
  size?: number;
}) {

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12,2 L18,11 L15,11 L20,18 L4,18 L9,11 L6,11 Z" fill="#4f8069" />
      <rect x="10.8" y="18" width="2.4" height="4" rx="0.6" fill="#8a6a4f" />
    </svg>
  );

}
