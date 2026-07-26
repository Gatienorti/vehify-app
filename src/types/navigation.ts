import type {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlateLookupResponse } from './api';
import type { LookupSource, PaidTier } from './vehicle';

export interface PlateMatchContext {
  plate: string;
  state: string;
  source: LookupSource;
  lastVerifiedAt: string | null;
}

/** Bottom tabs — History / SCAN (center) / Account (spec §4). */
export type TabParamList = {
  History: undefined;
  Scan: undefined;
  Account: undefined;
};

/** Root stack wraps the tabs plus the lookup/report detail screens. */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  /**
   * Confirm/enter a scanned plate or VIN — the single destination whether the
   * user captured (with a read, confident or not) or tapped "Type instead"
   * (`manual`). Owns the plate→VIN / VIN lookups.
   */
  ScanReview: {
    mode: 'plate' | 'vin';
    plate?: string;
    state?: string | null;
    vin?: string;
    imageUri?: string;
    /** The plate photo has a green highlight over the detected physical plate. */
    plateDetected?: boolean;
    /** Read confidence 0–100 (undefined = nothing read). Drives the banner. */
    confidence?: number;
    manual?: boolean;
  };
  /**
   * No `result` → the screen runs the plate lookup itself and shows its own
   * loading state. The scan flow navigates here IMMEDIATELY on "Search plate —
   * free" so the confirm sheet never collapses into a dead beat between screens.
   */
  VehicleMatch: { plate: string; state: string; result?: PlateLookupResponse };
  /** `lookup` → decode the VIN on arrival (fresh from scan/manual entry). */
  BasicResult: {
    vin: string;
    lookup?: boolean;
    /** Present when this VIN came from a plate lookup rather than direct VIN entry. */
    plateMatch?: PlateMatchContext;
  };
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
