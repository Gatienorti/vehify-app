import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../theme';
import PrimaryButton from './PrimaryButton';
import { US_STATES, normalizePlate } from '../utils/plate';
import { normalizeVin, validateVin } from '../utils/vin';
import { track } from '../config/analytics';

type Mode = 'vin' | 'plate';

interface Props {
  visible: boolean;
  /** Which tab to open on. Defaults to VIN (the free, exact path). */
  initialMode?: Mode;
  onClose: () => void;
  onSubmitVin: (vin: string) => void;
  onSubmitPlate: (plate: string, state: string) => void;
  submitting?: boolean;
}

export default function ManualEntrySheet({
  visible,
  initialMode = 'vin',
  onClose,
  onSubmitVin,
  onSubmitPlate,
  submitting = false,
}: Props) {
  const { colors, radius, spacing } = useTheme();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [vin, setVin] = useState('');
  const [plate, setPlate] = useState('');
  const [state, setState] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [statePickerOpen, setStatePickerOpen] = useState(false);

  // Clear every field and return to the intended tab each time the sheet
  // opens — otherwise a previous (wrong) VIN/plate/state and the last-used tab
  // persist into the next open (render-time reset, no stale-value flash).
  const [prevVisible, setPrevVisible] = useState(false);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setMode(initialMode);
      setVin('');
      setPlate('');
      setState('');
      setError(undefined);
      setStatePickerOpen(false);
    }
  }

  const reset = () => {
    setError(undefined);
  };

  const submitVin = () => {
    const check = validateVin(vin);
    if (!check.valid) {
      setError(check.error);
      return;
    }
    track('manual_vin_entered');
    onSubmitVin(normalizeVin(vin));
  };

  const submitPlate = () => {
    const p = normalizePlate(plate);
    if (p.length < 2) {
      setError('Enter a valid plate number.');
      return;
    }
    if (!state) {
      setError('Select a state.');
      return;
    }
    track('manual_plate_entered', { state });
    onSubmitPlate(p, state);
  };

  const tabStyle = (active: boolean) => [
    styles.tab,
    { backgroundColor: active ? colors.primary : colors.surfaceAlt, borderRadius: radius.sm },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }]}>
        <View style={styles.grabber} />
        <Text style={[styles.title, { color: colors.text }]}>Search manually</Text>

        <View style={[styles.tabs, { marginVertical: spacing.md }]}>
          <Pressable onPress={() => { setMode('vin'); reset(); }} style={tabStyle(mode === 'vin')}>
            <Text style={[styles.tabText, { color: mode === 'vin' ? colors.onPrimary : colors.text }]}>Enter VIN</Text>
          </Pressable>
          <Pressable onPress={() => { setMode('plate'); reset(); }} style={tabStyle(mode === 'plate')}>
            <Text style={[styles.tabText, { color: mode === 'plate' ? colors.onPrimary : colors.text }]}>Enter Plate</Text>
          </Pressable>
        </View>

        {mode === 'vin' ? (
          <TextInput
            value={vin}
            onChangeText={(t) => { setVin(t.toUpperCase()); reset(); }}
            placeholder="17-character VIN"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={17}
            style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
          />
        ) : (
          <>
            <TextInput
              value={plate}
              onChangeText={(t) => { setPlate(t.toUpperCase()); reset(); }}
              placeholder="Plate number"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
            />
            <Pressable
              onPress={() => setStatePickerOpen(true)}
              style={[styles.input, styles.stateSelect, { borderColor: colors.border, borderRadius: radius.md }]}
            >
              <Text style={{ color: state ? colors.text : colors.textMuted, fontSize: 16 }}>
                {state ? US_STATES.find((s) => s.code === state)?.name : 'Select state (required)'}
              </Text>
            </Pressable>
          </>
        )}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <PrimaryButton
          label="Search"
          loading={submitting}
          onPress={mode === 'vin' ? submitVin : submitPlate}
          style={{ marginTop: spacing.md }}
        />
      </View>

      <Modal visible={statePickerOpen} animationType="slide" onRequestClose={() => setStatePickerOpen(false)}>
        <View style={[styles.stateList, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.text, padding: spacing.lg }]}>Select state</Text>
          <FlatList
            data={US_STATES}
            keyExtractor={(s) => s.code}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { setState(item.code); setStatePickerOpen(false); reset(); }}
                style={[styles.stateRow, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.text, fontSize: 16 }}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 16 }}>{item.code}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 36 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#9993', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, marginTop: 8 },
  stateSelect: { justifyContent: 'center' },
  error: { fontSize: 14, marginTop: 8 },
  stateList: { flex: 1 },
  stateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
});
