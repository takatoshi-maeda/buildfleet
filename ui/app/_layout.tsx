import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import {
  StandaloneThemePreferenceProvider,
  useOptionalStandaloneThemePreference,
} from '../src/theme/StandaloneThemePreference';

function LayoutContent() {
  const systemColorScheme = useColorScheme();
  const standaloneTheme = useOptionalStandaloneThemePreference();
  const resolvedColorScheme =
    standaloneTheme?.resolvedColorScheme ?? systemColorScheme ?? 'light';

  return (
    <ThemeProvider value={resolvedColorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
      <StatusBar style={resolvedColorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <StandaloneThemePreferenceProvider>
      <LayoutContent />
    </StandaloneThemePreferenceProvider>
  );
}
