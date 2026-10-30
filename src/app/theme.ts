// Raw color values mirroring _theme.scss for use in Canvas 2D / JS contexts
// where CSS custom properties are not accessible.
// Keep in sync with src/styles/_theme.scss.

export const Theme = {
  default:     'rgba(255, 255, 255, 0.65)', // --bp-default
  defaultBg:   'rgba(255, 255, 255, 0.08)', // --bp-default-bg

  amber:       '#f0a36b',          // --bp-amber
  amberGlow:   'rgba(240, 150, 90, 0.8)',
  amberLight:  'rgba(248, 200, 165, 0.95)',
  amberStrong: 'rgba(240, 150, 90, 1)',

  cyan:        'rgb(140, 190, 225)', // --bp-cyan
  cyanGlow:    'rgba(100, 165, 215, 0.8)',
  cyanLight:   'rgba(175, 210, 235, 0.95)',

  danger:      'rgb(210, 75, 65)',  // --bp-danger

  surface:     'rgb(14, 10, 11)',           // --bp-surface
  surfaceHi:   'rgba(24, 18, 19, 0.84)',    // --bp-surface-hi
  surfaceCtrl: 'rgba(255, 255, 255, 0.055)', // --bp-surface-ctrl
} as const;
