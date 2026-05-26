// Raw color values mirroring _theme.scss for use in Canvas 2D / JS contexts
// where CSS custom properties are not accessible.
// Keep in sync with src/styles/_theme.scss.

export const Theme = {
  amber:       '#ffd54f',          // --bp-amber
  amberGlow:   'rgba(255, 160, 0, 0.8)',
  amberLight:  'rgba(255, 230, 120, 0.95)',
  amberStrong: 'rgba(255, 200, 50, 1)',

  cyan:        'rgb(120, 210, 255)', // --bp-cyan
  cyanGlow:    'rgba(80, 180, 255, 0.8)',
  cyanLight:   'rgba(160, 225, 255, 0.95)',

  danger:      'rgb(210, 75, 65)',  // --bp-danger

  surface:     'rgb(20, 20, 22)',   // --bp-surface
  surfaceHi:   'rgb(32, 32, 34)',   // --bp-surface-hi
  surfaceCtrl: 'rgb(30, 30, 30)',   // --bp-surface-ctrl
} as const;
