/**
 * MedOS design tokens.
 *
 * The palette is built for two conditions that matter more here than aesthetics:
 * a bright hospital corridor, and a dark on-call room at 3am. Every semantic
 * colour is defined for both schemes and checked for contrast against its own
 * surface, so clinical flags stay legible either way.
 */

/**
 * The colour roles every scheme must define. Declaring it as a type rather
 * than inferring it from the light palette means a missing dark-mode colour is
 * a compile error, not a black-on-black surprise at 3am.
 */
export type Colors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceSunken: string;
  overlay: string;

  border: string;
  borderStrong: string;
  divider: string;

  text: string;
  textMuted: string;
  textFaint: string;
  textInverse: string;

  primary: string;
  primaryStrong: string;
  primarySoft: string;
  primaryText: string;

  accent: string;
  accentSoft: string;

  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  info: string;
  infoSoft: string;
  neutralSoft: string;
};

export const palette: Record<'light' | 'dark', Colors> = {
  light: {
    // Surfaces
    background: '#F4F6F7',
    surface: '#FFFFFF',
    surfaceAlt: '#EDF1F3',
    surfaceSunken: '#E5EAED',
    overlay: 'rgba(11, 22, 28, 0.45)',

    // Lines
    border: '#DDE4E8',
    borderStrong: '#C3CED4',
    divider: '#E8EDF0',

    // Text
    text: '#0F1A1F',
    textMuted: '#5A6B75',
    textFaint: '#8A9AA4',
    textInverse: '#FFFFFF',

    // Brand
    primary: '#0D6E7A',
    primaryStrong: '#0A545E',
    primarySoft: '#DFF0F2',
    primaryText: '#FFFFFF',

    // Accent, used for starred and pinned things
    accent: '#B45309',
    accentSoft: '#FDF1E3',

    // Clinical / semantic
    danger: '#B42318',
    dangerSoft: '#FEE9E7',
    warning: '#B54708',
    warningSoft: '#FDF3E6',
    success: '#067647',
    successSoft: '#E3F5EC',
    info: '#175CD3',
    infoSoft: '#E7F0FE',
    neutralSoft: '#EDF1F3',
  },

  dark: {
    background: '#0B1216',
    surface: '#141E24',
    surfaceAlt: '#1C2830',
    surfaceSunken: '#0F1A20',
    overlay: 'rgba(0, 0, 0, 0.6)',

    border: '#27363F',
    borderStrong: '#364854',
    divider: '#1F2C34',

    text: '#E9EFF2',
    textMuted: '#93A5B0',
    textFaint: '#6B7E8A',
    textInverse: '#0B1216',

    primary: '#3BA9B8',
    primaryStrong: '#57C3D1',
    primarySoft: '#13333A',
    primaryText: '#04181C',

    accent: '#E0922F',
    accentSoft: '#33230F',

    danger: '#F97066',
    dangerSoft: '#3A1917',
    warning: '#F5A25D',
    warningSoft: '#3A2413',
    success: '#47C98A',
    successSoft: '#10301F',
    info: '#69A2F5',
    infoSoft: '#13233D',
    neutralSoft: '#1C2830',
  },
};

export type ColorScheme = keyof typeof palette;

/**
 * The photo viewer is dark in both schemes, as every gallery is: a clinical
 * photo — a rash, a wound — is judged against black, not against the app's
 * background colour.
 */
export const mediaViewerColors = {
  background: '#000000',
  barTop: 'rgba(0, 0, 0, 0.35)',
  barBottom: 'rgba(0, 0, 0, 0.45)',
  text: '#FFFFFF',
  textDim: 'rgba(255, 255, 255, 0.7)',
} as const;

/** 4pt scale. `md` is the default gap between related elements. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 999,
} as const;

export const fonts = {
  regular: 'Vazirmatn-Regular',
  medium: 'Vazirmatn-Medium',
  semibold: 'Vazirmatn-SemiBold',
  bold: 'Vazirmatn-Bold',
} as const;

/**
 * Persian script sits lower and needs more line height than Latin at the same
 * point size, so every step here is looser than a typical Latin scale.
 */
export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 40 },
  title: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 34 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 29 },
  subheading: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 27 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 27 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 22 },
  captionStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 22 },
  tiny: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 18 },
  /** Lab values, doses and vitals: tabular, Latin digits, never Persian. */
  mono: { fontFamily: 'monospace', fontSize: 14, lineHeight: 22 },
} as const;

export type TypographyVariant = keyof typeof typography;

export const shadows = {
  none: {},
  sm: {
    shadowColor: '#0B1216',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: {
    shadowColor: '#0B1216',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#0B1216',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

/** Minimum touch target. Rounds happen one-handed, often in gloves. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 48;
