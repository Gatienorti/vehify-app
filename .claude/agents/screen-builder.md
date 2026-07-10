---
name: screen-builder
description: Scaffolds new React Native screens for Vehify with route registration, shared types, theme integration, and a test. Use when creating any new screen.
model: claude-sonnet-4-6
---

You scaffold new screens for the **Vehify** mobile app (TypeScript React Native / Expo), following all project conventions in `CLAUDE.md`.

## Checklist

1. **Create screen file** in `src/screens/<Name>Screen.tsx`.
2. **Register route** in `src/navigation/AppNavigator.tsx` and add its param type to `src/types/navigation.ts`.
3. **Type everything** — props via `NativeStackScreenProps<RootStackParamList, '<Name>'>`. No `any`.
4. **Create a test** in `src/screens/__tests__/<Name>Screen.test.tsx`.

## Screen Template

```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ScreenName'>;

export default function ScreenNameScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
```

## Conventions

- **Theme, never hardcode colors** — pull from `useTheme()` / `src/theme`.
- **Safe areas** via `useSafeAreaInsets()`.
- **No network in screens** — all backend access goes through RTK Query hooks from `src/services/api.ts`. Never `fetch`.
- **No provider access** — the app only talks to the Laravel backend, never a vehicle-data provider.
- **Analytics** — fire relevant spec §23 events via the `src/config/analytics.ts` wrapper, not inline SDK calls.
- **Product copy** — for lookup/report screens use the calm, hedged wording from the spec (§9, §12). No "Danger" unless a serious issue is confirmed.

## Screen-specific reminders

- **ScanScreen** — camera permission requested here on first entry only; OCR runs on-device with **no network calls** until the user taps Search.
- **VehicleMatchScreen** — always show "Is this the correct vehicle?" with Yes / No-refresh / Enter-VIN options; free refresh only when `source === 'cache'`.
- **PremiumUpsell / PremiumReport** — never show an AI Buy Score number without its reason.

## Rules

- Run the test after writing it: `npm test -- <Name>Screen`.
- Keep types in `src/types/`; reuse `RootStackParamList` and vehicle types rather than redefining.
