import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, X } from 'lucide-react-native';
import { useTheme } from '../theme';
import { brandGradient } from '../theme/colors';
import { VBarcodeVin, VLicensePlate } from './vehifyIcons';
import type { IconCmp } from './SpecGrid';

/**
 * "How to scan" explainer. Since there's no separate Capture button anymore, the
 * key message is: tap the blue button in the center of the bottom bar to
 * capture. Also covers what/where a VIN vs a plate is.
 */
export default function ScanHelpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, radius } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner press-catcher so taps on the card don't close it. */}
        <Pressable style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>How to scan</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
              <X size={22} color={colors.textMuted} strokeWidth={2.25} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* The shutter — a mini of the real center button so it's unmistakable. */}
            <View style={styles.shutterRow}>
              <LinearGradient
                colors={brandGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shutter}
              >
                <Camera size={30} color="#FFFFFF" strokeWidth={2.4} />
              </LinearGradient>
              <Text style={[styles.shutterText, { color: colors.text }]}>
                Aim at the plate or VIN, then tap the{' '}
                <Text style={{ color: colors.primary, fontWeight: '800' }}>blue camera button</Text> in
                the center of the bottom bar to capture.
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <HelpItem
              icon={VBarcodeVin}
              color={colors.primary}
              title="Scanning a VIN"
              body="The VIN is exact, free and unlimited. Find it on the driver's door-jamb sticker, at the base of the windshield, or on the title. VIN barcodes scan on their own — no tap needed."
            />
            <HelpItem
              icon={VLicensePlate}
              color={colors.primary}
              title="Scanning a plate"
              body="Frame the whole license plate and pick the state on the next screen. We turn the plate into the vehicle's VIN for you."
            />
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.gotIt, { backgroundColor: colors.primary, borderRadius: radius.md, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.gotItText, { color: colors.onPrimary }]}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function HelpItem({ icon: Icon, color, title, body }: { icon: IconCmp; color: string; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.item}>
      <View style={[styles.itemIcon, { backgroundColor: `${color}14` }]}>
        <Icon size={22} color={color} />
      </View>
      <View style={styles.itemText}>
        <Text style={[styles.itemTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.itemBody, { color: colors.textMuted }]}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(6,10,20,0.6)', justifyContent: 'center', padding: 22 },
  card: { padding: 20, maxHeight: '82%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { gap: 18, paddingVertical: 8 },
  shutterRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  shutter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterText: { flex: 1, fontSize: 14.5, lineHeight: 20, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  itemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, gap: 3 },
  itemTitle: { fontSize: 15.5, fontWeight: '800' },
  itemBody: { fontSize: 13.5, lineHeight: 19 },
  gotIt: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, marginTop: 16 },
  gotItText: { fontSize: 16, fontWeight: '700' },
});
