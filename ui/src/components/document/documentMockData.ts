import type { DocumentChatMessage, DocumentReleaseNote, DocumentTreeNode } from './documentTypes';

export const documentTree: DocumentTreeNode[] = [
  {
    id: 'docs',
    name: 'Docs',
    path: 'docs',
    kind: 'folder',
    children: [
      {
        id: 'requirements',
        name: 'requirements.md',
        path: 'docs/requirements.md',
        kind: 'file',
        language: 'markdown',
        content: `# 要件定義

本ドキュメントは、マルチエージェント・ドキュメント管理システムの機能要件および非機能要件を定義します。

---

## 機能要件

### エージェント管理

- FR-001: システムは最大 10 の並列エージェントをサポートする
- FR-002: 各エージェントは独立した実行コンテキストを持つ
- FR-003: エージェント間はメッセージパッシング方式で連携する
- FR-004: エージェントの起動・停止・再試行を UI から操作できる

### ドキュメント操作

- FR-005: ユーザーはドキュメントのアップロード・編集・削除を行える
- FR-006: Markdown、プレーンテキスト、コードファイルをサポートする
- FR-007: 全文検索とバージョン履歴を提供する
- FR-008: AI エージェントがドキュメントを自律的に編集できる

### AI インターフェース

- FR-009: ユーザーはチャット形式でエージェントと対話を開始できる
- FR-010: エージェントはドキュメントへの変更を提案し、承認を求める
- FR-011: ストリーミングレスポンスをサポートする

---

## 非機能要件

| 項目 | 要件 |
| --- | --- |
| 応答時間 | チャット応答を 2 秒以内 (P99) |
| 可用性 | 99.9% SLA |
| ストレージ | ドキュメント総量 100MB/件 |
| 同時接続 | 最大 500 ユーザー |

---

## ステークホルダー

- プロダクトオーナー: 機能優先度の決定
- 開発チーム: 実装・テスト
- エンドユーザー: ドキュメント管理者、開発者
`,
      },
      {
        id: 'architecture',
        name: 'architecture.md',
        path: 'docs/architecture.md',
        kind: 'file',
        language: 'markdown',
        content: `# Architecture

## Layers

1. UI workspace
2. Front desk orchestration
3. File and release indexing
4. Agent runtime adapters

## Notes

- Editor state remains local until persistence is introduced.
- Release notes link back to source files so API-backed navigation can reuse the same shape.
- The front desk consumes workspace context instead of reading from global state directly.
`,
      },
      {
        id: 'api-reference',
        name: 'api-reference.md',
        path: 'docs/api-reference.md',
        kind: 'file',
        language: 'markdown',
        content: `# API Reference

## Planned endpoints

- GET /api/documents/files
- GET /api/documents/releases
- POST /api/documents/chat
- PUT /api/documents/files/:id

All endpoints are placeholders in this mock UI milestone.`,
      },
    ],
  },
  {
    id: 'src',
    name: 'src',
    path: 'src',
    kind: 'folder',
    children: [
      {
        id: 'agent-py',
        name: 'agent.py',
        path: 'src/agent.py',
        kind: 'file',
        language: 'python',
        content: `class FrontDeskAgent:
    def __init__(self, runtime, document_store):
        self.runtime = runtime
        self.document_store = document_store

    async def respond(self, prompt, context):
        file_name = context.get("file_name", "unknown")
        return f"Prepared a mock response for {file_name}: {prompt}"
`,
      },
      {
        id: 'document-manager-py',
        name: 'document_manager.py',
        path: 'src/document_manager.py',
        kind: 'file',
        language: 'python',
        content: `from pathlib import Path


class DocumentManager:
    def __init__(self, workspace_root: Path):
        self.workspace_root = workspace_root

    def list_documents(self):
        return sorted(str(path) for path in self.workspace_root.rglob("*") if path.is_file())
`,
      },
      {
        id: 'main-py',
        name: 'main.py',
        path: 'src/main.py',
        kind: 'file',
        language: 'python',
        content: `from agent import FrontDeskAgent
from document_manager import DocumentManager


def bootstrap():
    manager = DocumentManager(workspace_root=".")
    agent = FrontDeskAgent(runtime="mock", document_store=manager)
    return agent
`,
      },
    ],
  },
  {
    id: 'assets',
    name: 'assets',
    path: 'assets',
    kind: 'folder',
    children: [
      {
        id: 'system-diagram',
        name: 'system-diagram.png',
        path: 'assets/system-diagram.png',
        kind: 'file',
        language: 'image',
        content: `[binary image placeholder]
system overview
- ui
- app server
- agent runtime
- event watchers`,
      },
      {
        id: 'agent-visualization',
        name: 'agent-visualization.png',
        path: 'assets/agent-visualization.png',
        kind: 'file',
        language: 'image',
        content: `[binary image placeholder]
parallel agents
- front desk
- developer
- reviewer
- gatekeeper`,
      },
    ],
  },
  {
    id: 'readme',
    name: 'README.md',
    path: 'README.md',
    kind: 'file',
    language: 'markdown',
    content: `# Codefleet Workspace

This repository contains the orchestrator, UI, and supporting tools for backlog-driven multi-agent delivery.
`,
  },
  {
    id: 'changelog',
    name: 'CHANGELOG.md',
    path: 'CHANGELOG.md',
    kind: 'file',
    language: 'markdown',
    content: `# Changelog

## v2.3.0
- Added mock document workspace preview

## v2.2.0
- Added bundle interpretation and markdown preview groundwork

## v2.1.0
- Added AI chat interface
`,
  },
];

export const documentReleases: DocumentReleaseNote[] = [
  {
    id: 'release-230',
    version: 'v2.3.0',
    title: 'マルチエージェント並行実行',
    publishedAt: '2026-02-18T09:30:00.000Z',
    summary: '並列エージェント監視とキュー処理の可観測性を追加。',
    linkedFilePath: 'docs/requirements.md',
  },
  {
    id: 'release-220',
    version: 'v2.2.0',
    title: 'バンドル解釈 & Markdown プレビュー',
    publishedAt: '2026-01-09T11:00:00.000Z',
    summary: 'ドキュメント構造の理解とプレビュー基盤を整理。',
    linkedFilePath: 'docs/architecture.md',
  },
  {
    id: 'release-210',
    version: 'v2.1.0',
    title: 'AI チャットインターフェース',
    publishedAt: '2025-12-02T16:40:00.000Z',
    summary: 'フロントデスク AI との対話ワークフローを導入。',
    linkedFilePath: 'src/agent.py',
  },
  {
    id: 'release-200',
    version: 'v2.0.0',
    title: 'v2.0 メジャーアップデート',
    publishedAt: '2025-10-21T08:15:00.000Z',
    summary: 'ドキュメント管理システムの基盤を全面更新。',
    linkedFilePath: 'README.md',
  },
  {
    id: 'release-150',
    version: 'v1.5.2',
    title: 'パフォーマンス改善',
    publishedAt: '2025-08-04T13:10:00.000Z',
    summary: 'ファイルツリー描画と検索の体感速度を改善。',
    linkedFilePath: 'CHANGELOG.md',
  },
];

export const initialDocumentChatMessages: DocumentChatMessage[] = [
  {
    id: 'chat-1',
    role: 'agent',
    content: 'フロントデスクです。要件整理、リリース確認、編集方針の相談を受け付けます。',
    timestamp: '2026-03-10T09:00:00.000Z',
  },
  {
    id: 'chat-2',
    role: 'user',
    content: 'requirements.md を起点に、直近リリースへ反映すべき項目を見たいです。',
    timestamp: '2026-03-10T09:00:14.000Z',
  },
  {
    id: 'chat-3',
    role: 'agent',
    content: '現在は v2.3.0 が選択候補です。requirements.md と結び付く変更点を右ペインから案内できます。',
    timestamp: '2026-03-10T09:00:20.000Z',
  },
];

export const initialDocumentOpenTabIds = [
  'agent-visualization',
  'main-py',
  'document-manager-py',
  'architecture',
  'requirements',
];
