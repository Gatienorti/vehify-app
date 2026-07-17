import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlateLookupResponse } from './api';
import type { PaidTier } from './vehicle';

/** Bottom tabs — History / SCAN (center) / Account (spec §4). */
export type TabParamList = {
  History: undefined;
  /** openVinEntry: land with the manual VIN sheet open (e.g. after a rejected plate match). */
  Scan: { openVinEntry?: boolean } | undefined;
  Account: undefined;
};

/** Root stack wraps the tabs plus the lookup/report detail screens. */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  VehicleMatch: { result: PlateLookupResponse; plate: string; state: string };
  BasicResult: { vin: string };
  /**
   * Upsell for a paid tier. `tier` selects Buyer's Analysis vs the Complete
   * History upgrade.
   */
  PremiumUpsell: { vin: string; tier: PaidTier };
  PremiumReport: { vin: string; reportId?: string; tier: PaidTier };
};

/** Props for a stack (detail) screen. */
export type StackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

/** Props for a tab screen — can navigate to both tab and stack routes. */
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
