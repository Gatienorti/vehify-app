import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../theme';
import PrimaryButton from './PrimaryButton';
import LoadingOverlay from './LoadingOverlay';
import { creditLabel, formatUsd } from '../config/pricing';
import { BUILDING_REPORT_MESSAGES } from '../config/loadingMessages';
import { parseOptionalPositiveInt } from '../utils/number';

interface Props {
  visible: boolean;
  /** Dollar price for the in-app-purchase path. */
  price: number;
  /**
   * When set, the buyer has enough credits — the CTA reads "Use N credits"
   * and NO price is shown (credits-first). Undefined → normal $ purchase.
   */
  creditCost?: number;
  submitting?: boolean;
  /** Electric/plug-in vehicle — shows the ZIP input (charging density). */
  isElectric?: boolean;
  onCancel: () => void;
  /** Buy with whatever was entered — undefined fields were skipped. */
  onBuy: (mileage: number | undefined, askingPrice: number | undefined, zip: string | undefined) => void;
}

/**
 * The buy step as a bottom sheet — no separate screen. Optional inputs
 * (they personalize the valuation + deal verdict; EVs also get a ZIP for
 * nearby-charging context), then purchase. Skipping is always one tap: the
 * inputs never block the sale.
 */
export default function BuyAnalysisSheet({ visible, price, creditCost, submitting = false, isElectric = false, onCancel, onBuy }: Props) {
  const { colors, spacing, radius } = useTheme();
  const [mileageText, setMileageText] = useState('');
  const [askingPriceText, setAskingPriceText] = useState('');
  const [zipText, setZipText] = useState('');

  const buy = () => {
    const zip = /^\d{5}$/.test(zipText.trim()) ? zipText.trim() : undefined;
    onBuy(parseOptionalPositiveInt(mileageText), parseOptionalPositiveInt(askingPriceText), zip);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onCancel} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              padding: spacing.lg,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
            },
          ]}
        >
          <View style={styles.grabber} />
          <Text style={[styles.title, { color: colors.text }]}>Standing at the car?</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Add the odometer and asking price to get a deal verdict and a value personalized to
            this exact mileage. Both optional.
          </Text>

          <Text style={[styles.label, { color: colors.textMuted, marginTop: spacing.md }]}>
            Odometer (miles)
          </Text>
          <TextInput
            value={mileageText}
            onChangeText={setMileageText}
            placeholder="e.g. 78200"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={7}
            editable={!submitting}
            style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
          />
          <Text style={[styles.label, { color: colors.textMuted }]}>Asking price ($)</Text>
          <TextInput
            value={askingPriceText}
            onChangeText={setAskingPriceText}
            placeholder="e.g. 18500"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={7}
            editable={!submitting}
            style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
          />
          {isElectric ? (
            <>
              <Text style={[styles.label, { color: colors.textMuted }]}>
                Your ZIP (chargers near you)
              </Text>
              <TextInput
                value={zipText}
                onChangeText={setZipText}
                placeholder="e.g. 10001"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={5}
                editable={!submitting}
                style={[styles.input, { color: colors.text, borderColor: colors.border, borderRadius: radius.md }]}
              />
            </>
          ) : null}

          <PrimaryButton
            label={
              creditCost !== undefined
                ? `${creditLabel(creditCost)} — Buyer Report`
                : `Buy Buyer Report — ${formatUsd(price)}`
            }
            loading={submitting}
            onPress={buy}
            style={{ marginTop: spacing.md }}
          />
          <Pressable onPress={onCancel} disabled={submitting} style={styles.cancelRow} hitSlop={8}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>Not now</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <LoadingOverlay visible={submitting} title="Building your analysis…" messages={BUILDING_REPORT_MESSAGES} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { paddingBottom: 36 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#9993', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  cancelRow: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
