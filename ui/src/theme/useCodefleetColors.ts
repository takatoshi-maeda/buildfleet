import { useTheme } from '@react-navigation/native';

export type CodefleetColors = {
  text: string;
  mutedText: string;
  background: string;
  surface: string;
  surfaceBorder: string;
  surfaceSelected: string;
  tint: string;
  error: string;
};

export function useCodefleetColors(): CodefleetColors {
  const { dark } = useTheme();

  if (dark) {
    return {
      text: '#d1d5db',
      mutedText: '#7f858a',
      background: '#151718',
      surface: '#1e1f20',
      surfaceBorder: '#2a2d2f',
      surfaceSelected: '#1e3a5f',
      tint: '#ffffff',
      error: '#f87171',
    };
  }

  return {
    text: '#374151',
    mutedText: '#8b929b',
    background: '#ffffff',
    surface: '#ffffff',
    surfaceBorder: '#e5e7eb',
    surfaceSelected: '#eff6ff',
    tint: '#0a7ea4',
    error: '#dc2626',
  };
}
