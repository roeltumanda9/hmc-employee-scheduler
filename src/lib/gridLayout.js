/* ------------------------------------------------------------------
   Layout
   Desktop ("fit"): columns are sized from the measured pane width so the
   whole period (name + every day + 4 totals) fits with no horizontal
   scroll. Phones and narrow tablets fall back to fixed sizes and scroll
   sideways with the name column pinned.
   Sizes are in px (not rem) because the root font is 18px on desktop.
   ------------------------------------------------------------------ */

// Smallest usable day column when fitting; below this we scroll instead.
export const MIN_FIT_DAY = 33;

// Fit-mode type/cell scale, chosen by how wide each day column ends up.
export const FIT_TIERS = [
  {
    upTo: 42, // 1280px-class screens
    cellH: 34,
    cellPad: "p-[2px]",
    cellRadius: "rounded-md",
    cellText: "text-[10.5px] tracking-[-0.02em]",
    nameText: "text-[13px]",
    metaText: "text-[11px]",
    dayNum: "text-[12.5px]",
    dayNumCircle: "w-[24px] h-[24px]",
    weekday: "text-[9.5px]",
    summaryText: "text-[13px]",
  },
  {
    upTo: 56, // 1366–1600px
    cellH: 40,
    cellPad: "p-[3px]",
    cellRadius: "rounded-lg",
    cellText: "text-[12px]",
    nameText: "text-[14px]",
    metaText: "text-[11.5px]",
    dayNum: "text-[14px]",
    dayNumCircle: "w-[28px] h-[28px]",
    weekday: "text-[10px]",
    summaryText: "text-[14px]",
  },
  {
    upTo: Infinity, // 1680px and up
    cellH: 46,
    cellPad: "p-1",
    cellRadius: "rounded-[10px]",
    cellText: "text-[13.5px]",
    nameText: "text-[15px]",
    metaText: "text-[12px]",
    dayNum: "text-[15px]",
    dayNumCircle: "w-[32px] h-[32px]",
    weekday: "text-[11px]",
    summaryText: "text-[15px]",
  },
];

// Tablets / small windows: fixed sizes, horizontal scroll.
export const SCROLL_SIZES = {
  empW: 200,
  dayW: 60,
  summaryW: 76,
  cellH: 48,
  cellPad: "p-[3px]",
  cellRadius: "rounded-lg",
  cellText: "text-[13px]",
  nameText: "text-[15px]",
  metaText: "text-[12px]",
  dayNum: "text-[14px]",
  dayNumCircle: "w-[30px] h-[30px]",
  weekday: "text-[10.5px]",
  summaryText: "text-[15px]",
};

// Phones: ~5 days on screen, each cell still a ≥44px touch target.
export const COMPACT_SIZES = {
  empW: 124,
  dayW: 52,
  summaryW: 64,
  cellH: 44,
  cellPad: "p-[3px]",
  cellRadius: "rounded-lg",
  cellText: "text-[13px]",
  nameText: "text-[13px]",
  metaText: "text-[11px]",
  dayNum: "text-[14px]",
  dayNumCircle: "w-[28px] h-[28px]",
  weekday: "text-[10px]",
  summaryText: "text-[14px]",
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Column widths for a pane `width` px wide. The name and totals columns are
// sized from `stableWidth` (the outer width) so they never change when a
// vertical scrollbar comes or goes; only the day columns absorb it.
function fitSizes(width, dayCount, stableWidth = width) {
  const empW = Math.round(clamp(stableWidth * 0.18, 160, 260));
  const summaryW = Math.round(clamp(stableWidth * 0.055, 52, 84));
  // Floor to 1/100 px so rounding can never push the table past the pane.
  const dayW = Math.floor(((width - empW - 4 * summaryW) / dayCount) * 100) / 100;
  return { empW, summaryW, dayW };
}

/**
 * `paneWidth`: the space inside the grid pane (excludes a vertical
 * scrollbar); columns are sized to fill it exactly.
 * `outerWidth`: the pane including any scrollbar. Whether to fit and which
 * type tier to use are decided from it, so a scrollbar appearing or
 * disappearing (which changes `paneWidth`) can't flip the tier, change row
 * heights, and toggle the scrollbar again.
 */
export function computeLayout(paneWidth, dayCount, compact, outerWidth = paneWidth) {
  if (compact) return { ...COMPACT_SIZES, fit: false };
  if (paneWidth > 0 && dayCount > 0) {
    const decide = fitSizes(outerWidth, dayCount);
    if (decide.dayW >= MIN_FIT_DAY) {
      const tier = FIT_TIERS.find((t) => decide.dayW < t.upTo);
      return { ...tier, ...fitSizes(paneWidth, dayCount, outerWidth), fit: true };
    }
  }
  return { ...SCROLL_SIZES, fit: false };
}
