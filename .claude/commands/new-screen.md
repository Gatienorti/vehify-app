Create a new React Native screen called $ARGUMENTS following all Vehify conventions (see CLAUDE.md).

Steps:
1. Create `src/screens/$ARGUMENTSScreen.tsx` from the standard TypeScript template:
   - Props typed via `NativeStackScreenProps<RootStackParamList, '$ARGUMENTS'>`.
   - Colors from `useTheme()` (never hardcode). Safe areas via `useSafeAreaInsets()`.
   - No `fetch` and no provider calls — backend access only through RTK Query hooks in `src/services/api.ts`.
2. Register the route in `src/navigation/AppNavigator.tsx` and add `$ARGUMENTS` to `RootStackParamList` in `src/types/navigation.ts`.
3. Fire any relevant spec §23 analytics events via the `src/config/analytics.ts` wrapper.
4. Create a test at `src/screens/__tests__/$ARGUMENTSScreen.test.tsx` and run `npm test -- $ARGUMENTS`.
5. Run `npx tsc --noEmit` to confirm types.

Use the name in $ARGUMENTS as-is for the component and route name. Prefer the `screen-builder` agent for the full scaffold.
