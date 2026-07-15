import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

interface Props {
  visible: boolean;
  title: string;
  /**
   * Rotating status lines (one shown at a time, advancing every few seconds)
   * — each loading context brings its own set, ideally with a wink. Keeps a
   * long wait feeling alive instead of frozen.
   */
  messages: string[];
  /** Dim the content underneath. Off for empty screens (first load). */
  dim?: boolean;
}

const ROTATE_MS = 2500;

/** Full-screen blocking loader: shade + spinner + title + rotating message. */
export default function LoadingOverlay({ visible, title, messages, dim = true }: Props) {
  const { colors, radius } = useTheme();
  // Rolling tick → message index. No synchronous reset needed: where the
  // rotation starts is arbitrary, it only has to keep moving while visible.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!visible || messages.length <= 1) return;
    const id = setInterval(() => setTick((t) => t + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [visible, messages]);

  if (!visible) return null;

  const index = messages.length ? tick % messages.length : 0;

  return (
    <View
      style={[styles.wrap, dim && { backgroundColor: colors.overlay }]}
      pointerEvents="auto"
      accessibilityRole="progressbar"
    >
      <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {messages.length ? (
          <Text style={[styles.message, { color: colors.textMuted }]}>{messages[index]}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 32,
  },
  card: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 12,
    alignSelf: 'stretch',
  },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
