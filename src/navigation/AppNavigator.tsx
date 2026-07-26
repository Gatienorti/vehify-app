import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import FloatingTabBar from '../components/FloatingTabBar';
import HistoryScreen from '../screens/HistoryScreen';
import ScanScreen from '../screens/ScanScreen';
import AccountScreen from '../screens/AccountScreen';
import ScanReviewScreen from '../screens/ScanReviewScreen';
import VehicleMatchScreen from '../screens/VehicleMatchScreen';
import BasicResultScreen from '../screens/BasicResultScreen';
import PremiumUpsellScreen from '../screens/PremiumUpsellScreen';
import PremiumReportScreen from '../screens/PremiumReportScreen';
import { track } from '../config/analytics';
import type { RootStackParamList, TabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      initialRouteName="Scan"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        listeners={{ tabPress: () => track('scan_button_tapped') }}
      />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        // Chevron only — otherwise iOS labels the back button with the
        // previous route's name (users saw a literal "Tabs" button).
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="ScanReview" component={ScanReviewScreen} options={{ title: 'Confirm' }} />
      <Stack.Screen name="VehicleMatch" component={VehicleMatchScreen} options={{ title: 'Plate lookup' }} />
      {/* Credit chip in the nav bar is set per-screen via useCreditHeaderButton
          so it's genuinely absent at zero balance (an empty headerRight still
          leaves iOS's glass pill behind — a blank white round shape). */}
      <Stack.Screen
        name="BasicResult"
        component={BasicResultScreen}
        options={{ title: 'Basic check' }}
      />
      <Stack.Screen
        name="PremiumUpsell"
        component={PremiumUpsellScreen}
        options={{ title: 'Full report' }}
      />
      <Stack.Screen
        name="PremiumReport"
        component={PremiumReportScreen}
        options={{ title: 'Vehicle history' }}
      />
    </Stack.Navigator>
  );
}
