import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  CodefleetClient,
  DocumentFileResult,
  DocumentTreeNode as RemoteDocumentTreeNode,
  DocumentWatchEvent,
} from '../mcp/client';
import { useCodefleetColors } from '../theme/useCodefleetColors';
import {
  buildBreadcrumbSegments,
  resolveDocumentLink,
  type ResolvedDocumentLink,
} from './document/documentNavigation';
import { findDefaultDocumentFileId } from './document/documentDefaultSelection';
import { DocumentExplorerPane } from './document/DocumentExplorerPane';
import { DocumentFilePreview } from './document/DocumentFilePreview';
import { DocumentMarkdownLivePreview } from './document/DocumentMarkdownLivePreview';
import type { DocumentTreeNode } from './document/documentTypes';

type Props = {
  client: CodefleetClient;
};

function flattenTree(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenTree(node.children) : [])]);
}

function mapTree(nodes: RemoteDocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? mapTree(node.children) : undefined,
  }));
}

function collectInitiallyCollapsedFolderIds(
  nodes: DocumentTreeNode[],
  depth: number = 0,
  collapsed: Set<string> = new Set(),
): Set<string> {
  for (const node of nodes) {
    if (node.kind !== 'folder') {
      continue;
    }
    if (depth >= 2) {
      collapsed.add(node.id);
    }
    if (node.children) {
      collectInitiallyCollapsedFolderIds(node.children, depth + 1, collapsed);
    }
  }
  return collapsed;
}

function isBinaryPreviewLanguage(language?: DocumentTreeNode['language']): boolean {
  return language === 'image' || language === 'video' || language === 'pdf' || language === 'binary';
}

function PlainDocumentBody({
  content,
  textColor,
  mutedTextColor,
  borderColor,
}: {
  content: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
}) {
  return (
    <ScrollView style={styles.documentScroll} contentContainerStyle={styles.documentScrollContent}>
      <View style={[styles.previewCard, { borderColor, backgroundColor: `${borderColor}14` }]}>
        <Text style={[styles.previewLabel, { color: mutedTextColor }]}>Preview</Text>
        <ScrollView horizontal>
          <Text style={[styles.codeText, styles.plainPreviewText, { color: textColor }]}>{content}</Text>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

export function RequirementsDocumentPane({ client }: Props) {
  const colors = useCodefleetColors();
  const [tree, setTree] = useState<DocumentTreeNode[]>([]);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(() => new Set());
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [fileDetailsByFileId, setFileDetailsByFileId] = useState<Record<string, DocumentFileResult>>({});
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const hasAppliedInitialFolderCollapseRef = useRef(false);

  const allNodes = useMemo(() => flattenTree(tree), [tree]);
  const nodeById = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes]);
  const activeFile = activeFileId ? nodeById.get(activeFileId) ?? null : null;
  const activeFileDetails = activeFileId ? fileDetailsByFileId[activeFileId] ?? null : null;
  const activeAssetUrl =
    activeFile && isBinaryPreviewLanguage(activeFile.language) ? client.getDocumentAssetUrl(activeFile.id) : null;
  const breadcrumbSegments = useMemo(
    () => (activeFile ? buildBreadcrumbSegments(activeFile.path) : []),
    [activeFile],
  );

  const refreshTree = useCallback(async () => {
    const payload = await client.listDocumentsTree();
    const nextTree = mapTree(payload.root);
    setTree(nextTree);
    if (!hasAppliedInitialFolderCollapseRef.current) {
      setCollapsedFolderIds(collectInitiallyCollapsedFolderIds(nextTree));
      hasAppliedInitialFolderCollapseRef.current = true;
    }
  }, [client]);

  const loadFile = useCallback(
    async (fileId: string) => {
      const payload = await client.getDocumentFile(fileId);
      setFileDetailsByFileId((previous) => ({ ...previous, [fileId]: payload }));
    },
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setIsLoadingTree(true);
        await refreshTree();
        if (!cancelled) {
          setErrorMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load documents.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTree(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTree]);

  useEffect(() => {
    if (activeFileId) {
      return;
    }
    const defaultFileId = findDefaultDocumentFileId(tree, collapsedFolderIds);
    if (defaultFileId) {
      setActiveFileId(defaultFileId);
    }
  }, [activeFileId, collapsedFolderIds, tree]);

  useEffect(() => {
    if (!activeFile || activeFile.kind !== 'file') {
      return;
    }
    if (fileDetailsByFileId[activeFile.id]) {
      return;
    }
    void loadFile(activeFile.id).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load document.');
    });
  }, [activeFile, fileDetailsByFileId, loadFile]);

  useEffect(() => {
    const abort = new AbortController();
    const handleEvent = (event: DocumentWatchEvent) => {
      if (event.type === 'document.snapshot') {
        setTree(mapTree(event.payload.root));
        return;
      }
      if (event.type === 'document.changed') {
        void refreshTree().catch(() => undefined);
        if (event.payload.path === activeFileId) {
          void loadFile(event.payload.path).catch(() => undefined);
        }
        return;
      }
      if (event.type === 'document.deleted') {
        void refreshTree().catch(() => undefined);
        if (event.payload.path === activeFileId) {
          setActiveFileId(null);
        }
        setFileDetailsByFileId((previous) => {
          const next = { ...previous };
          delete next[event.payload.path];
          return next;
        });
        return;
      }
      if (event.type === 'document.error') {
        setErrorMessage(event.payload.message ?? 'Document watch failed.');
      }
    };

    void client.watchDocuments({
      signal: abort.signal,
      onEvent: handleEvent,
    }).catch((error) => {
      if (abort.signal.aborted) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Failed to watch documents.');
    });

    return () => abort.abort();
  }, [activeFileId, client, loadFile, refreshTree]);

  const handleToggleFolder = useCallback((node: DocumentTreeNode) => {
    if (node.kind !== 'folder') {
      return;
    }
    setCollapsedFolderIds((previous) => {
      const next = new Set(previous);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.add(node.id);
      }
      return next;
    });
  }, []);

  const handleSelectTreeNode = useCallback((node: DocumentTreeNode) => {
    if (node.kind === 'folder') {
      return;
    }
    setActiveFileId(node.id);
    setErrorMessage(null);
    setIsExplorerOpen(false);
  }, []);

  const navigateToResolvedLink = useCallback(
    async (resolved: ResolvedDocumentLink) => {
      if (resolved.kind === 'external') {
        await Linking.openURL(resolved.href);
        return;
      }
      if (resolved.kind === 'anchor') {
        return;
      }
      const target = nodeById.get(resolved.path);
      if (!target || target.kind !== 'file') {
        setErrorMessage(`Document not found: ${resolved.path}`);
        return;
      }
      setActiveFileId(target.id);
      setErrorMessage(null);
    },
    [nodeById],
  );

  const handlePressInlineLink = useCallback(
    (href: string) => {
      if (!activeFile) {
        return;
      }
      const resolved = resolveDocumentLink(activeFile.path, href);
      if (!resolved) {
        return;
      }
      void navigateToResolvedLink(resolved);
    },
    [activeFile, navigateToResolvedLink],
  );

  const explorer = (
    <DocumentExplorerPane
      tree={tree}
      selectedTreeNodeId={activeFileId}
      collapsedFolderIds={collapsedFolderIds}
      onSelectTreeNode={handleSelectTreeNode}
      onToggleFolder={handleToggleFolder}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <View style={[styles.header, { borderBottomColor: colors.surfaceBorder }]}>
        <View style={styles.headerRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbRow}>
          {breadcrumbSegments.length > 0 ? (
            breadcrumbSegments.map((segment, index) => {
              const targetNode = nodeById.get(segment.path);
              const isLast = index === breadcrumbSegments.length - 1;
              return (
                <View key={segment.path} style={styles.breadcrumbItem}>
                  {index > 0 ? (
                    <Ionicons name="chevron-forward" size={12} color={colors.mutedText} />
                  ) : null}
                  <Pressable
                    disabled={!targetNode || targetNode.kind !== 'file'}
                    onPress={() => {
                      if (targetNode?.kind === 'file') {
                        setActiveFileId(targetNode.id);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.breadcrumbText,
                        { color: isLast ? colors.text : colors.mutedText },
                      ]}
                    >
                      {segment.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          ) : (
            <Text style={[styles.breadcrumbPlaceholder, { color: colors.mutedText }]}>
              Choose a document
            </Text>
          )}
          </ScrollView>
          <Pressable
            onPress={() => setIsExplorerOpen((value) => !value)}
            style={styles.menuIconButton}
            accessibilityLabel="Open document explorer"
          >
            <Ionicons name={isExplorerOpen ? 'close-outline' : 'menu-outline'} size={16} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {errorMessage ? (
        <View style={[styles.banner, { borderBottomColor: colors.surfaceBorder, backgroundColor: colors.background }]}>
          <Text style={[styles.bannerText, { color: colors.text }]} numberOfLines={2}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      {Platform.OS === 'web' ? (
        isExplorerOpen ? (
          <View style={styles.explorerOverlay}>
            <Pressable style={styles.explorerBackdrop} onPress={() => setIsExplorerOpen(false)} />
            <View style={[styles.explorerDrawer, { borderColor: colors.surfaceBorder, backgroundColor: colors.background }]}>
              {explorer}
            </View>
          </View>
        ) : null
      ) : (
        <Modal visible={isExplorerOpen} transparent animationType="fade" onRequestClose={() => setIsExplorerOpen(false)}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.explorerBackdrop} onPress={() => setIsExplorerOpen(false)} />
            <View style={[styles.modalDrawer, { borderColor: colors.surfaceBorder, backgroundColor: colors.background }]}>
              {explorer}
            </View>
          </View>
        </Modal>
      )}

      <View style={styles.body}>
        {isLoadingTree ? (
          <View style={styles.centerState}>
            <Text style={[styles.centerText, { color: colors.mutedText }]}>Loading documents...</Text>
          </View>
        ) : !activeFile ? (
          <View style={styles.centerState}>
            <Text style={[styles.centerTitle, { color: colors.text }]}>ドキュメントがありません</Text>
            <Text style={[styles.centerText, { color: colors.mutedText }]}>
              利用可能なドキュメントが作成されると、ここに表示されます。
            </Text>
          </View>
        ) : isBinaryPreviewLanguage(activeFile.language) ? (
          <DocumentFilePreview
            assetUrl={activeAssetUrl}
            language={activeFile.language ?? 'binary'}
            textColor={colors.text}
            mutedTextColor={colors.mutedText}
          />
        ) : activeFile.language === 'markdown' ? (
          <DocumentMarkdownLivePreview
            content={activeFileDetails?.content ?? ''}
            onPressLink={handlePressInlineLink}
            textColor={colors.text}
            mutedTextColor={colors.mutedText}
            tintColor={colors.tint}
            borderColor={colors.surfaceBorder}
          />
        ) : (
          <PlainDocumentBody
            content={activeFileDetails?.content ?? ''}
            textColor={colors.text}
            mutedTextColor={colors.mutedText}
            borderColor={colors.surfaceBorder}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderLeftWidth: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuIconButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumbRow: {
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breadcrumbText: {
    fontSize: 13,
    fontWeight: '600',
  },
  breadcrumbPlaceholder: {
    fontSize: 13,
  },
  banner: {
    minHeight: 36,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  explorerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    flexDirection: 'row',
  },
  explorerBackdrop: {
    flex: 1,
    backgroundColor: '#00000024',
  },
  explorerDrawer: {
    width: 320,
    maxWidth: '100%',
    borderLeftWidth: 1,
  },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  modalDrawer: {
    width: 320,
    maxWidth: '86%',
    borderLeftWidth: 1,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  centerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  centerText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  documentScroll: {
    flex: 1,
  },
  documentScrollContent: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
  },
  codeText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    lineHeight: 20,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  plainPreviewText: {
    minWidth: '100%',
  },
});
