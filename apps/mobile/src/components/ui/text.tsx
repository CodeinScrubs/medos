import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, type Colors, type TypographyVariant } from '@/theme';

type ColorKey = keyof Colors;

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: ColorKey;
  align?: TextStyle['textAlign'];
  /**
   * Force left-to-right. Used for anything Latin that would otherwise be
   * reordered by the RTL layout: drug names, lab analytes, URLs, file paths.
   */
  ltr?: boolean;
  /** Clinical numbers: tabular figures, Latin digits, never reordered. */
  numeric?: boolean;
};

/**
 * Every piece of text in MedOS goes through here, so the type scale and the
 * RTL/LTR decision are made in one place rather than sprinkled across screens.
 */
export function Text({ variant = 'body', color = 'text', align, ltr, numeric, style, ...rest }: TextProps) {
  const theme = useTheme();
  const base = numeric ? theme.typography.mono : theme.typography[variant];

  return (
    <RNText
      {...rest}
      style={[
        base,
        { color: theme.colors[color] },
        (ltr || numeric) && { writingDirection: 'ltr', textAlign: align ?? 'left' },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
