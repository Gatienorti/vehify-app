import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { store } from './src/store';
import { ThemeProvider, useTheme } from './src/theme';
import { RootNavigator } from './src/navigation/AppNavigator';
import { hydrateHistory } from './src/features/history/localHistory';
import { hydrateSettings } from './src/features/settings/localSettings';
import { hydrateAuthSession } from './src/features/auth/localAuth';
import { hydrateCredits } from './src/features/credits/localCredits';
import { getDeviceId } from './src/config/deviceId';
import { initRevenueCat } from './src/config/revenuecat';
import { track } from './src/config/analytics';

/** Follows the effective theme — including the user's dark-mode override. */
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function App() {
  useEffect(() => {
    void hydrateHistory(store.dispatch);
    void hydrateSettings(store.dispatch);
    void hydrateAuthSession(store.dispatch);
    void hydrateCredits(store.dispatch);
    // RevenueCat customer id = our device id, matching the backend's
    // device-keyed purchase ownership.
    void getDeviceId().then(initRevenueCat);
    track('app_opened');
  }, []);

  return (
    <Provider store={store}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <NavigationContainer>
              <RootNavigator />
              <ThemedStatusBar />
            </NavigationContainer>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Provider>
  );
}
