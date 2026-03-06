import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CodefleetItem } from '../mcp/types';
import { useCodefleetColors } from '../theme/useCodefleetColors';
import { formatCodefleetTimestamp } from './statusTiming';

type Props = {
  item: CodefleetItem;
  isSelected: boolean;
  onPress: () => void;
};

function formatDate(value?: string): string {
  return formatCodefleetTimestamp(value) ?? '-';
}

export function Card({ item, isSelected, onPress }: Props) {
  const colors = useCodefleetColors();
  const textColor = colors.text;
  const subTextColor = colors.mutedText;
  const borderColor = colors.surfaceBorder;
  const selectedBg = colors.surfaceSelected;
  const cardBg = colors.background;

  return (
    <Pressable
      style={[
        styles.card,
        {
          borderColor,
          backgroundColor: isSelected ? selectedBg : cardBg,
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
        {item.title}
      </Text>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: subTextColor }]}>{item.kind ?? 'unknown'}</Text>
        <Text style={[styles.meta, { color: subTextColor }]}>{item.status ?? 'unknown'}</Text>
      </View>
      <Text style={[styles.updatedAt, { color: subTextColor }]} numberOfLines={1}>
        {formatDate(item.updatedAt)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  meta: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  updatedAt: {
    fontSize: 11,
  },
});
