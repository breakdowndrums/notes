import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { AppQueryProvider } from '@/lib/query/query-provider';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppQueryProvider>
          <AuthProvider>
            <AnimatedSplashOverlay />
            <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
          </AuthProvider>
        </AppQueryProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
