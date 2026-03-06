import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

type StandaloneThemePreferenceValue = {
  themePreference: ThemePreference;
  resolvedColorScheme: 'light' | 'dark';
  cycleThemePreference: () => void;
};

const STORAGE_KEY = 'codefleet-ui.themePreference';
const StandaloneThemePreferenceContext =
  createContext<StandaloneThemePreferenceValue | null>(null);

function readStoredThemePreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function writeStoredThemePreference(value: ThemePreference): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, value);
}

export function StandaloneThemePreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const systemScheme = useColorScheme();
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(readStoredThemePreference);

  const resolvedColorScheme: 'light' | 'dark' =
    themePreference === 'system' ? systemScheme ?? 'light' : themePreference;

  const value = useMemo<StandaloneThemePreferenceValue>(
    () => ({
      themePreference,
      resolvedColorScheme,
      cycleThemePreference: () => {
        const next =
          themePreference === 'system'
            ? 'light'
            : themePreference === 'light'
              ? 'dark'
              : 'system';
        setThemePreference(next);
        writeStoredThemePreference(next);
      },
    }),
    [resolvedColorScheme, themePreference],
  );

  return (
    <StandaloneThemePreferenceContext.Provider value={value}>
      {children}
    </StandaloneThemePreferenceContext.Provider>
  );
}

export function useOptionalStandaloneThemePreference():
  | StandaloneThemePreferenceValue
  | null {
  return useContext(StandaloneThemePreferenceContext);
}
