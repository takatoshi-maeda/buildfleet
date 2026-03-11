import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCodefleetColors } from '../../theme/useCodefleetColors';
import type { DocumentTreeNode } from './documentTypes';

type Props = {
  tree: DocumentTreeNode[];
  selectedTreeNodeId: string | null;
  onSelectTreeNode: (node: DocumentTreeNode) => void;
};

function iconNameForNode(node: DocumentTreeNode): keyof typeof Ionicons.glyphMap {
  if (node.kind === 'folder') {
    return 'folder-open-outline';
  }
  if (node.language === 'markdown') {
    return 'document-text-outline';
  }
  if (node.language === 'python') {
    return 'logo-python';
  }
  if (node.language === 'image') {
    return 'image-outline';
  }
  return 'document-outline';
}

type TreeRowProps = {
  node: DocumentTreeNode;
  depth: number;
  selectedTreeNodeId: string | null;
  onSelectTreeNode: (node: DocumentTreeNode) => void;
};

function TreeRow({ node, depth, selectedTreeNodeId, onSelectTreeNode }: TreeRowProps) {
  const colors = useCodefleetColors();
  const isSelected = selectedTreeNodeId === node.id;
  const children = node.children ?? [];

  return (
    <View>
      <Pressable
        onPress={() => onSelectTreeNode(node)}
        style={[
          styles.treeRow,
          { paddingLeft: 14 + depth * 16 },
          isSelected && { backgroundColor: colors.surfaceSelected, borderColor: colors.tint },
        ]}
      >
        <Ionicons
          name={iconNameForNode(node)}
          size={14}
          color={node.kind === 'folder' ? colors.mutedText : colors.tint}
        />
        <Text style={[styles.treeLabel, { color: colors.text }]} numberOfLines={1}>
          {node.name}
        </Text>
      </Pressable>
      {node.kind === 'folder'
        ? children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedTreeNodeId={selectedTreeNodeId}
              onSelectTreeNode={onSelectTreeNode}
            />
          ))
        : null}
    </View>
  );
}

export function DocumentExplorerPane({
  tree,
  selectedTreeNodeId,
  onSelectTreeNode,
}: Props) {
  const colors = useCodefleetColors();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: colors.surfaceBorder }]}>
        <Text style={[styles.title, { color: colors.text }]}>エクスプローラー</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View>
          {tree.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              selectedTreeNodeId={selectedTreeNodeId}
              onSelectTreeNode={onSelectTreeNode}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    paddingVertical: 12,
    gap: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionPanel: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  treeRow: {
    minHeight: 32,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderLeftWidth: 2,
    borderColor: 'transparent',
  },
  treeLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
});
