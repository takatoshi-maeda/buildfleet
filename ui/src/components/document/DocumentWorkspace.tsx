import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { CodefleetClient } from '../../mcp/client';
import { useCodefleetColors } from '../../theme/useCodefleetColors';
import { ThreadPane } from '../ThreadPane';
import { DocumentEditorPane } from './DocumentEditorPane';
import { DocumentExplorerPane } from './DocumentExplorerPane';
import { documentTree, initialDocumentOpenTabIds } from './documentMockData';
import type { DocumentTreeNode } from './documentTypes';

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1120;
const MOBILE_PANES = ['explorer', 'editor', 'frontdesk'] as const;

type MobilePane = (typeof MOBILE_PANES)[number];

function flattenTree(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenTree(node.children) : [])]);
}

type Props = {
  client: CodefleetClient;
};

export function DocumentWorkspace({ client }: Props) {
  const colors = useCodefleetColors();
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const isTablet = width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT;
  const allNodes = useMemo(() => flattenTree(documentTree), []);
  const fileNodes = useMemo(
    () => allNodes.filter((node): node is DocumentTreeNode => node.kind === 'file'),
    [allNodes],
  );
  const nodeById = useMemo(
    () => new Map(allNodes.map((node) => [node.id, node])),
    [allNodes],
  );
  const initialOpenTabs = useMemo(() => {
    const directNodes = initialDocumentOpenTabIds
      .map((id) => {
        const node = nodeById.get(id);
        return node?.kind === 'file' ? node : null;
      })
      .filter((node): node is DocumentTreeNode => node !== null);
    return directNodes.length > 0 ? directNodes : fileNodes.slice(0, 3);
  }, [fileNodes, nodeById]);

  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState<string | null>('requirements');
  const [openTabs, setOpenTabs] = useState<DocumentTreeNode[]>(initialOpenTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>('requirements');
  const [draftByFileId, setDraftByFileId] = useState<Record<string, string>>(() =>
    Object.fromEntries(fileNodes.map((node) => [node.id, node.content ?? ''])),
  );
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor');

  const activeFile = activeTabId ? nodeById.get(activeTabId) ?? null : null;
  const activeFileDraft = activeFile?.kind === 'file' ? draftByFileId[activeFile.id] ?? '' : '';

  const ensureTabOpen = useCallback((node: DocumentTreeNode) => {
    if (node.kind !== 'file') return;
    setOpenTabs((previous) => {
      if (previous.some((item) => item.id === node.id)) return previous;
      return [...previous, node];
    });
    setActiveTabId(node.id);
  }, []);

  const handleSelectTreeNode = useCallback(
    (node: DocumentTreeNode) => {
      setSelectedTreeNodeId(node.id);
      if (node.kind === 'file') {
        ensureTabOpen(node);
        setMobilePane('editor');
      }
    },
    [ensureTabOpen],
  );

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    setSelectedTreeNodeId(tabId);
    setMobilePane('editor');
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      setOpenTabs((previous) => {
        const next = previous.filter((tab) => tab.id !== tabId);
        if (activeTabId === tabId) {
          const fallback = next[next.length - 1] ?? null;
          setActiveTabId(fallback?.id ?? null);
          setSelectedTreeNodeId(fallback?.id ?? null);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const handleChangeDraft = useCallback((next: string) => {
    if (!activeFile || activeFile.kind !== 'file') return;
    setDraftByFileId((previous) => ({ ...previous, [activeFile.id]: next }));
  }, [activeFile]);

  const explorerPane = (
    <DocumentExplorerPane
      tree={documentTree}
      selectedTreeNodeId={selectedTreeNodeId}
      onSelectTreeNode={handleSelectTreeNode}
    />
  );

  const editorPane = (
    <DocumentEditorPane
      openTabs={openTabs}
      activeTabId={activeTabId}
      activeFile={activeFile?.kind === 'file' ? activeFile : null}
      draft={activeFileDraft}
      onSelectTab={handleSelectTab}
      onCloseTab={handleCloseTab}
      onChangeDraft={handleChangeDraft}
    />
  );

  const frontDeskPane = <ThreadPane client={client} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isMobile ? (
        <View style={styles.mobileLayout}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mobileTabRow}
          >
            {MOBILE_PANES.map((pane) => {
              const isActive = mobilePane === pane;
              const label =
                pane === 'explorer' ? 'Explorer' : pane === 'editor' ? 'Editor' : 'Front Desk';
              return (
                <Pressable
                  key={pane}
                  onPress={() => setMobilePane(pane)}
                  style={[
                    styles.mobileTabButton,
                    {
                      backgroundColor: isActive ? colors.tint : colors.surface,
                      borderColor: isActive ? colors.tint : colors.surfaceBorder,
                    },
                  ]}
                >
                  <Text style={[styles.mobileTabText, { color: isActive ? colors.background : colors.text }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.mobilePane}>
            {mobilePane === 'explorer'
              ? explorerPane
              : mobilePane === 'editor'
                ? editorPane
                : frontDeskPane}
          </View>
        </View>
      ) : (
        <View style={styles.desktopRow}>
          <View style={[styles.explorerColumn, isTablet ? styles.explorerColumnTablet : styles.explorerColumnDesktop]}>
            {explorerPane}
          </View>
          <View style={styles.editorColumn}>{editorPane}</View>
          <View style={[styles.chatColumn, isTablet ? styles.chatColumnTablet : styles.chatColumnDesktop]}>
            {frontDeskPane}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
  },
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
  },
  explorerColumn: {
    minWidth: 220,
  },
  explorerColumnTablet: {
    width: 240,
  },
  explorerColumnDesktop: {
    width: 280,
  },
  editorColumn: {
    flex: 1,
  },
  chatColumn: {
    minWidth: 280,
  },
  chatColumnTablet: {
    width: 300,
  },
  chatColumnDesktop: {
    width: 340,
  },
  mobileLayout: {
    flex: 1,
  },
  mobileTabRow: {
    gap: 0,
  },
  mobileTabButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  mobilePane: {
    flex: 1,
  },
});
