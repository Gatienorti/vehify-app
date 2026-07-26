import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { US_STATES } from '../utils/plate';

interface Props {
  visible: boolean;
  onSelect: (code: string) => void;
  onClose: () => void;
}

/** Full-screen US-state picker — shared by the scan/manual entry flows. */
export default function StatePickerModal({ visible, onSelect, onClose }: Props) {
  const { colors, spacing } = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.list, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text, padding: spacing.lg }]}>Select state</Text>
        <FlatList
          data={US_STATES}
          keyExtractor={(s) => s.code}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => onSelect(item.code)}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.text, fontSize: 16 }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>{item.code}</Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
});
