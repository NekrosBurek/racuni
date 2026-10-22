// Light and dark palettes; every screen takes its colors from here so nothing is left in the system's default
// text color (which is white in dark mode and vanished on the app's white backgrounds).
import { StyleSheet, useColorScheme } from 'react-native';

const light = {
  dark: false,
  bg: '#f6f7f9', // screen behind cards and lists
  surface: '#ffffff', // cards, rows, sheets, bars
  surfaceAlt: '#f0f2f5', // inputs, section headers
  border: '#e2e5e9',
  borderSoft: '#f0f0f0',
  text: '#1b1f24',
  textDim: '#5f6670',
  textFaint: '#8a9099',
  accent: '#1565c0', // links, highlights, chart bars
  accentSoft: '#e3edfb', // tinted buttons and badges
  button: '#1565c0', // filled buttons, with white text
  selected: '#e3f0ff',
  ok: '#1a7f37',
  warn: '#b35900',
  warnText: '#7a5600',
  warnBg: '#fff6e0',
  warnBorder: '#f0d58c',
  danger: '#c62828',
  dangerSoft: '#fdecec',
};

const dark = {
  dark: true,
  bg: '#0f1115',
  surface: '#181b20',
  surfaceAlt: '#23272e',
  border: '#2c313a',
  borderSoft: '#22262d',
  text: '#e8eaed',
  textDim: '#a6adb7',
  textFaint: '#717984',
  accent: '#7cb3ff',
  accentSoft: '#1c2b40',
  button: '#2f6fd0',
  selected: '#1f3350',
  ok: '#4cc26a',
  warn: '#f0a040',
  warnText: '#f3c97a',
  warnBg: '#33290f',
  warnBorder: '#5a4718',
  danger: '#ff6b6b',
  dangerSoft: '#3a1c1c',
};

export const useTheme = () => (useColorScheme() === 'dark' ? dark : light);

// const useStyles = makeStyles(c => ({ ... }));  then  const styles = useStyles();  inside the component.
export function makeStyles(build) {
  const cache = new Map();
  return function useStyles() {
    const c = useTheme();
    if (!cache.has(c)) cache.set(c, StyleSheet.create(build(c)));
    return cache.get(c);
  };
}
