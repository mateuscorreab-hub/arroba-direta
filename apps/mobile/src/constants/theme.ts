export const Colors = {
  light: {
    text: '#1f2a1c',
    textSecondary: '#5d6b58',
    background: '#faf8f3',
    backgroundElement: '#ffffff',
    backgroundSelected: '#e7efe2',
    border: '#e3dfd3',
    brand: '#2f6b2a',
    onBrand: '#ffffff',
    danger: '#b3261e',
  },
  dark: {
    text: '#e8ede4',
    textSecondary: '#9fae99',
    background: '#121611',
    backgroundElement: '#1a2018',
    backgroundSelected: '#243021',
    border: '#2c3529',
    brand: '#7cc46f',
    onBrand: '#10200d',
    danger: '#f2b8b5',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
} as const;
