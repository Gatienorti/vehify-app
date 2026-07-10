import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import ScanTabButton from '../components/ScanTabButton';
import HistoryScreen from '../screens/HistoryScreen';
import ScanScreen from '../screens/ScanScreen';
import AccountScreen from '../screens/AccountScreen';
import VehicleMatchScreen from '../screens/VehicleMatchScreen';
import BasicResultScreen from '../screens/BasicResultScreen';
import PremiumUpsellScreen from '../screens/PremiumUpsellScreen';
import PremiumReportScreen from '../screens/PremiumReportScreen';
import { track } from '../config/analytics';
import type { RootStackParamList, TabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function Tabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 88,
          paddingTop: 8,
        },
      }}
    >
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{ tabBarButton: (props) => <ScanTabButton {...props} /> }}
        listeners={{ tabPress: () => track('scan_button_tapped') }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
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
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="VehicleMatch" component={VehicleMatchScreen} options={{ title: 'Confirm vehicle' }} />
      <Stack.Screen name="BasicResult" component={BasicResultScreen} options={{ title: 'Basic check' }} />
      <Stack.Screen name="PremiumUpsell" component={PremiumUpsellScreen} options={{ title: 'Full report' }} />
      <Stack.Screen name="PremiumReport" component={PremiumReportScreen} options={{ title: 'Vehicle history' }} />
    </Stack.Navigator>
  );
}
