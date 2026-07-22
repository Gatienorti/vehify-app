import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import FloatingTabBar from '../components/FloatingTabBar';
import HistoryScreen from '../screens/HistoryScreen';
import ScanScreen from '../screens/ScanScreen';
import AccountScreen from '../screens/AccountScreen';
import VehicleMatchScreen from '../screens/VehicleMatchScreen';
import BasicResultScreen from '../screens/BasicResultScreen';
import PremiumUpsellScreen from '../screens/PremiumUpsellScreen';
import PremiumReportScreen from '../screens/PremiumReportScreen';
import CreditBadge from '../components/CreditBadge';
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
      <Stack.Screen name="VehicleMatch" component={VehicleMatchScreen} options={{ title: 'Confirm vehicle' }} />
      {/* Credit chip in the nav bar — transparent so iOS's own glass pill is
          the single container (no double-pill). Self-hides unless ever held. */}
      <Stack.Screen
        name="BasicResult"
        component={BasicResultScreen}
        options={{ title: 'Basic check', headerRight: () => <CreditBadge variant="header" /> }}
      />
      <Stack.Screen
        name="PremiumUpsell"
        component={PremiumUpsellScreen}
        options={{ title: 'Full report', headerRight: () => <CreditBadge variant="header" /> }}
      />
      <Stack.Screen
        name="PremiumReport"
        component={PremiumReportScreen}
        options={{ title: 'Vehicle history', headerRight: () => <CreditBadge variant="header" /> }}
      />
    </Stack.Navigator>
  );
}
