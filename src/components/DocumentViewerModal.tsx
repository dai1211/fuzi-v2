import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Lock,
  Unlock,
  Copy,
  Check,
  Printer,
  AlertTriangle,
  Sparkles,
  Calendar,
  User,
  Tag,
  Building2,
  BookmarkCheck,
  Clock,
  MessageSquare,
  Send,
  GitCompare,
  Layers,
  RefreshCw,
  Edit3,
  ExternalLink,
  Plus,
  Inbox,
  Trash2,
} from 'lucide-react';
import { SchoolDoc, UserRole, RelatedDocumentItem, DeadlineItem } from '../types';

interface DocumentViewerModalProps {
  document: SchoolDoc | null;
  isOpen: boolean;
  onClose: () => void;
  userRole: UserRole;
  highlightSection?: string;
  onAskAIAboutDoc?: (doc: SchoolDoc) => void;
  onSwitchDocument?: (docId: string) => void;
  onDocumentUpdated?: (updatedDoc: SchoolDoc) => void;
  onDelete?: (doc: SchoolDoc) => void;
  useGeminiIfAvailable?: boolean;
}

interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const result: DiffLine[] = [];

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    const o = oldLines[i];
    const n = newLines[j];
    if (i < oldLines.length && j < newLines.length && o === n) {
      result.push({ type: 'same', text: o });
      i++;
      j++;
    } else if (i < oldLines.length && !newSet.has(o)) {
      result.push({ type: 'removed', text: o });
      i++;
    } else if (j < newLines.length && !oldSet.has(n)) {
      result.push({ type: 'added', text: n });
      j++;
    } else {
      if (i < oldLines.length) {
        result.push({ type: 'removed', text: o });
        i++;
      }
      if (j < newLines.length) {
        result.push({ type: 'added', text: n });
        j++;
      }
    }
  }
  return result;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document,
  isOpen,
  onClose,
  userRole,
  highlightSection,
  onAskAIAboutDoc,
  onSwitchDocument,
  onDocumentUpdated,
  onDelete,
  useGeminiIfAvailable = true,
}) => {
  const [viewMode, setViewMode] = useState<
    'masked' | 'original' | 'pii' | 'evidence' | 'qa' | 'related' | 'history'
  >('masked');
  const [copied, setCopied] = useState(false);
  const [showUnlockNotice, setShowUnlockNotice] = useState(false);

  // AI Summary regeneration state
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryPoints, setSummaryPoints] = useState<string[]>([]);
  const [summaryModel, setSummaryModel] = useState<string | null>(null);

  // Document-specific AI Q&A state
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaHistory, setQaHistory] = useState<{ q: string; a: string; model?: string }[]>([]);

  // Related documents state
  const [relatedDocs, setRelatedDocs] = useState<RelatedDocumentItem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Revision / Update History & Diff state
  const [oldRevVer, setOldRevVer] = useState<number>(1);
  const [newRevVer, setNewRevVer] = useState<number>(1);
  const [isEditingRevision, setIsEditingRevision] = useState(false);
  const [editBodyText, setEditBodyText] = useState('');
  const [editChangeNote, setEditChangeNote] = useState('');
  const [isSavingRevision, setIsSavingRevision] = useState(false);

  // Direct metadata editing state (receivedFrom & deadlines)
  const [receivedFromInput, setReceivedFromInput] = useState('');
  const [deadlinesList, setDeadlinesList] = useState<DeadlineItem[]>([]);
  const [newDeadlineLabel, setNewDeadlineLabel] = useState('提出期限');
  const [newDeadlineDate, setNewDeadlineDate] = useState('');
  const [newDeadlineType, setNewDeadlineType] = useState<DeadlineItem['type']>('提出期限');
  const [newDeadlineUrgency, setNewDeadlineUrgency] = useState<DeadlineItem['urgency']>('近日');
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [metadataSavedMessage, setMetadataSavedMessage] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  useEffect(() => {
    if (document) {
      setViewMode(highlightSection ? 'evidence' : 'masked');
      setSummaryText(document.summary);
      setSummaryPoints(document.aiSummaryPoints || []);
      setSummaryModel(null);
      setQaHistory([]);
      setQaInput('');
      setIsEditingRevision(false);
      setEditBodyText(document.originalText || '');
      setEditChangeNote('');
      setReceivedFromInput(document.receivedFrom || '');
      setDeadlinesList(document.deadlines || []);
      setMetadataSavedMessage(null);
      setMetadataError(null);
      setNewDeadlineDate('');

      const revs = document.revisions || [];
      if (revs.length >= 2) {
        setOldRevVer(revs[revs.length - 2].version);
        setNewRevVer(revs[revs.length - 1].version);
      } else if (revs.length === 1) {
        setOldRevVer(revs[0].version);
        setNewRevVer(revs[0].version);
      }
    }
  }, [document?.id, highlightSection]);

  useEffect(() => {
    if (isOpen && document && viewMode === 'related') {
      setLoadingRelated(true);
      fetch(`/api/documents/${document.id}/related?role=${encodeURIComponent(userRole)}`)
        .then((r) => (r.ok ? r.json() : { related: [] }))
        .then((data) => setRelatedDocs(data.related || []))
        .catch(() => setRelatedDocs([]))
        .finally(() => setLoadingRelated(false));
    }
  }, [isOpen, document?.id, viewMode, userRole]);

  if (!isOpen || !document) return null;

  const canViewOriginal = userRole === '校長・教頭';

  const handleCopy = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = window.document.createElement('textarea');
        el.value = text;
        window.document.body.appendChild(el);
        el.select();
        window.document.execCommand('copy');
        window.document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleOriginalTabClick = () => {
    if (!canViewOriginal) {
      setShowUnlockNotice(true);
      setTimeout(() => setShowUnlockNotice(false), 3500);
      return;
    }
    setViewMode('original');
  };

  const handleRegenerateSummary = async () => {
    setIsSummarizing(true);
    try {
      const res = await fetch(`/api/documents/${document.id}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useGeminiIfAvailable }),
      });
      const data = await res.json();
      if (res.ok) {
        setSummaryText(data.summary);
        setSummaryPoints(data.aiSummaryPoints || []);
        setSummaryModel(data.modelUsed);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleAskDocumentQA = async (questionOverride?: string) => {
    const q = (questionOverride ?? qaInput).trim();
    if (!q || qaLoading) return;
    if (!questionOverride) setQaInput('');
    setQaLoading(true);
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: q,
          userRole,
          useGeminiIfAvailable,
          targetDocId: document.id,
        }),
      });
      const data = await res.json();
      setQaHistory((prev) => [
        ...prev,
        { q, a: data.response || '回答を取得できませんでした。', model: data.modelUsed },
      ]);
    } catch {
      setQaHistory((prev) => [
        ...prev,
        { q, a: 'ローカルAIへの問い合わせに失敗しました。' },
      ]);
    } finally {
      setQaLoading(false);
    }
  };

  const handleSaveNewRevision = async () => {
    if (!editBodyText.trim()) return;
    setIsSavingRevision(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: editBodyText,
          changeNote: editChangeNote.trim() || `第${document.version + 1}版 改訂更新`,
          updatedBy: userRole,
        }),
      });
      const data = await res.json();
      if (res.ok && data.document) {
        const updated: SchoolDoc = data.document;
        onDocumentUpdated?.(updated);
        setIsEditingRevision(false);
        setSummaryText(updated.summary);
        setSummaryPoints(updated.aiSummaryPoints || []);
        const revs = updated.revisions || [];
        if (revs.length >= 2) {
          setOldRevVer(revs[revs.length - 2].version);
          setNewRevVer(revs[revs.length - 1].version);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingRevision(false);
    }
  };

  const persistMetadata = async (nextReceivedFrom: string, nextDeadlines: DeadlineItem[], feedbackText: string) => {
    setIsSavingMetadata(true);
    setMetadataSavedMessage(null);
    setMetadataError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedFrom: nextReceivedFrom,
          deadlines: nextDeadlines,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.document) {
        throw new Error(data.error || '書類情報の保存に失敗しました');
      }
      onDocumentUpdated?.(data.document);
      setMetadataSavedMessage(feedbackText);
      setTimeout(() => setMetadataSavedMessage(null), 2500);
    } catch (err: any) {
      console.error('Failed to update metadata:', err);
      setMetadataError(err?.message || '書類情報の保存に失敗しました');
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const handleSaveReceivedFrom = () => {
    persistMetadata(receivedFromInput, deadlinesList, '受領元を保存しました');
  };

  const handleAddDeadlineItem = () => {
    if (!newDeadlineDate.trim()) return;
    const item: DeadlineItem = {
      label: newDeadlineLabel.trim() || '期限',
      dateText: newDeadlineDate.trim(),
      type: newDeadlineType,
      urgency: newDeadlineUrgency,
    };
    const nextDeadlines = [...deadlinesList, item];
    setDeadlinesList(nextDeadlines);
    setNewDeadlineDate('');
    persistMetadata(receivedFromInput, nextDeadlines, '期限を設定しました');
  };

  const handleRemoveDeadlineItem = (index: number) => {
    const nextDeadlines = deadlinesList.filter((_, idx) => idx !== index);
    setDeadlinesList(nextDeadlines);
    persistMetadata(receivedFromInput, nextDeadlines, '期限を削除しました');
  };

  const revisions = document.revisions || [];
  const oldRevObj = revisions.find((r) => r.version === oldRevVer) || revisions[0];
  const newRevObj = revisions.find((r) => r.version === newRevVer) || revisions[revisions.length - 1];
  const diffLines =
    oldRevObj && newRevObj ? computeLineDiff(oldRevObj.maskedText, newRevObj.maskedText) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-[2px]">
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {document.importance === '緊急・重要' && (
                <>
                  <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>緊急・重要</span>
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                </>
              )}
              {document.importance === '重要' && (
                <>
                  <span className="text-amber-700 font-semibold">重要</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                </>
              )}
              <span className="font-medium text-indigo-700">{document.category}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span
                className={
                  document.securityLevel === '機密'
                    ? 'text-rose-700 font-medium'
                    : document.securityLevel === '学年・部局限定'
                    ? 'text-slate-700 font-medium'
                    : 'text-slate-500'
                }
              >
                {document.securityLevel}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span>{document.fiscalYear}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums uppercase text-slate-400">
                v{document.version} · {document.fileType} · {document.pageCount}p
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">
              {document.title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onAskAIAboutDoc && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAskAIAboutDoc(document);
                }}
                className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AIアシスタントで対話</span>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDelete(document);
                }}
                className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>削除</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Unlocked Warning Notice */}
        {showUnlockNotice && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900 shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>原本（実名・電話番号・住所）の閲覧制限:</strong> 現在の権限（{userRole}）では原本の生データを閲覧できません。「校長・教頭」権限に切り替えてください。
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowUnlockNotice(false)}
              className="text-amber-700 hover:text-amber-900 font-bold ml-3"
              aria-label="通知を閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tab Switcher & Action Toolbar */}
        <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* View Mode Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setViewMode('masked')}
              className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'masked'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>仮名化表示</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('qa')}
              className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'qa'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
              <span>AI質問</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('related')}
              className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'related'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>関連書類</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('history')}
              className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'history'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5 text-indigo-600" />
              <span>更新履歴 ({revisions.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('evidence')}
              className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'evidence'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>根拠条項</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('pii')}
              className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'pii'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-indigo-600" />
              <span>個人情報 ({document.piiCount})</span>
            </button>

            <button
              type="button"
              onClick={handleOriginalTabClick}
              className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'original'
                  ? 'bg-white text-rose-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {canViewOriginal ? (
                <Unlock className="w-3.5 h-3.5 text-rose-600" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>原本</span>
            </button>
          </div>

          {/* Quick Copy / Print Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  viewMode === 'original' && canViewOriginal
                    ? document.originalText
                    : document.maskedText
                )
              }
              className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">コピー完了</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>週報用コピー</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              title="印刷"
              aria-label="印刷"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Document Content Viewport */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-4">
          {/* Metadata Ribbon */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-slate-400 block text-[11px]">担当部署</span>
                <span className="font-medium text-slate-800 flex items-center gap-1.5 mt-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{document.department}</span>
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">作成者</span>
                <span className="font-medium text-slate-800 flex items-center gap-1.5 mt-1">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {canViewOriginal ? document.author : document.authorMasked}
                  </span>
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">更新年月日</span>
                <span className="font-medium text-slate-800 font-mono tabular-nums flex items-center gap-1.5 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{document.date}</span>
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">重要度判定</span>
                <span
                  className={`font-semibold flex items-center gap-1.5 mt-1 ${
                    document.importance === '緊急・重要'
                      ? 'text-rose-700'
                      : document.importance === '重要'
                      ? 'text-amber-700'
                      : 'text-slate-700'
                  }`}
                >
                  {document.importance}
                </span>
              </div>
            </div>

            {/* Editable Received From Field */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <label
                htmlFor="viewer-received-from"
                className="font-semibold text-slate-700 flex items-center gap-1.5 shrink-0"
              >
                <Inbox className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>誰からもらった資料か（受領元）</span>
              </label>

              <div className="flex items-center gap-2 flex-1 sm:max-w-md">
                <input
                  id="viewer-received-from"
                  type="text"
                  value={receivedFromInput}
                  onChange={(e) => setReceivedFromInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveReceivedFrom();
                    }
                  }}
                  placeholder="例: 教頭先生 / 教育委員会 / PTA本部..."
                  className="flex-1 h-8 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                />
                <button
                  type="button"
                  onClick={handleSaveReceivedFrom}
                  disabled={isSavingMetadata}
                  className="h-8 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  保存
                </button>
              </div>
            </div>
          </div>

          {/* Extracted & Custom Deadlines Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>設定済み期限・日程:</span>
                </span>
                {deadlinesList.length > 0 ? (
                  deadlinesList.map((dl, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md font-mono tabular-nums text-slate-800"
                    >
                      <span className="font-sans text-slate-500">{dl.label}:</span>
                      <strong className={dl.urgency === '緊急' ? 'text-rose-700' : 'text-slate-900'}>
                        {dl.dateText}
                      </strong>
                      <button
                        type="button"
                        onClick={() => handleRemoveDeadlineItem(idx)}
                        disabled={isSavingMetadata}
                        className="text-slate-400 hover:text-rose-600 font-bold ml-0.5"
                        aria-label={`${dl.label}を削除`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">未設定</span>
                )}
              </div>

              {metadataSavedMessage && (
                <span className="text-emerald-700 font-semibold shrink-0">
                  {metadataSavedMessage}
                </span>
              )}
              {metadataError && (
                <span className="text-rose-700 font-semibold shrink-0">
                  {metadataError}
                </span>
              )}
            </div>

            {/* Inline Deadline Setter */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                期限を設定:
              </span>
              <input
                type="text"
                value={newDeadlineLabel}
                onChange={(e) => setNewDeadlineLabel(e.target.value)}
                placeholder="期限内容（例: 提出期限）"
                className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-36 focus:outline-none focus:bg-white focus:border-indigo-600"
              />
              <input
                type="date"
                value={newDeadlineDate}
                onChange={(e) => setNewDeadlineDate(e.target.value)}
                className="h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:bg-white focus:border-indigo-600"
              />
              <select
                value={newDeadlineType}
                onChange={(e) => setNewDeadlineType(e.target.value as DeadlineItem['type'])}
                className="h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600"
              >
                <option value="提出期限">提出期限</option>
                <option value="開催日">開催日</option>
                <option value="定期期日">定期期日</option>
              </select>
              <select
                value={newDeadlineUrgency}
                onChange={(e) => setNewDeadlineUrgency(e.target.value as DeadlineItem['urgency'])}
                className="h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600"
              >
                <option value="緊急">緊急</option>
                <option value="近日">近日</option>
                <option value="通常">通常</option>
              </select>
              <button
                type="button"
                onClick={handleAddDeadlineItem}
                disabled={isSavingMetadata || !newDeadlineDate.trim()}
                className="h-8 inline-flex items-center gap-1 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>期限を追加</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              {(document.keywords || []).map((kw, i) => (
                <span key={i} className="font-medium text-indigo-700">
                  #{kw}
                </span>
              ))}
            </div>
          </div>

          {/* MODE 1: MASKED TEXT + AI SUMMARY */}
          {viewMode === 'masked' && (
            <div className="space-y-4">
              {/* Concise AI Summary Panel */}
              <div className="bg-white border border-indigo-200 rounded-xl p-5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>AI要約（要点まとめ）</span>
                    {summaryModel && (
                      <span className="font-mono text-[11px] font-normal text-slate-500">
                        · {summaryModel}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleRegenerateSummary}
                    disabled={isSummarizing}
                    className="h-7 inline-flex items-center gap-1.5 px-2.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSummarizing ? 'animate-spin' : ''}`} />
                    <span>{isSummarizing ? '要約生成中...' : 'AI要約を再生成'}</span>
                  </button>
                </div>

                <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed">
                  {summaryText}
                </p>

                {summaryPoints.length > 0 && (
                  <ul className="space-y-1.5 pt-1 text-xs text-slate-600">
                    {summaryPoints.map((pt, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="font-mono text-indigo-600 font-semibold shrink-0 tabular-nums">
                          0{idx + 1}.
                        </span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Full Masked Body */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 text-xs text-slate-500">
                  <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>個人情報仮名化済みプレビュー（校内AI・DB蓄積テキスト）</span>
                  </span>
                  <span className="text-slate-400 font-mono tabular-nums">
                    {(document.originalText || '').length} 文字 / {document.pageCount} ページ
                  </span>
                </div>
                <div className="font-mono text-xs sm:text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {document.maskedText}
                </div>
              </div>
            </div>
          )}

          {/* MODE 2: DOCUMENT-SPECIFIC AI Q&A */}
          {viewMode === 'qa' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <span>この書類の内容についてAIに質問</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  『{document.title}』の仮名化文脈のみを参照し、根拠付きで回答します。
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  'この書類の提出期限や重要な日程は？',
                  '教職員が取るべき具体的な手順・注意点を教えて',
                  '緊急時・トラブル発生時の連絡先は？',
                  '保護者向け連絡文の要点をまとめて',
                ].map((sq, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAskDocumentQA(sq)}
                    className="px-3 py-1.5 text-xs bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 rounded-lg transition-colors"
                  >
                    {sq}
                  </button>
                ))}
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {qaHistory.length === 0 && !qaLoading && (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-slate-200">
                    上の候補をクリックするか、下の入力欄から質問を送信してください。
                  </div>
                )}

                {qaHistory.map((item, i) => (
                  <div key={i} className="space-y-2">
                    <div className="bg-indigo-600 text-white text-xs px-3.5 py-2.5 rounded-lg ml-auto w-fit max-w-[85%]">
                      {item.q}
                    </div>
                    <div className="bg-slate-50 border border-slate-200 text-slate-800 text-xs p-3.5 rounded-lg whitespace-pre-wrap leading-relaxed">
                      {item.a}
                      {item.model && (
                        <div className="mt-2 pt-1.5 border-t border-slate-200 text-[10px] font-mono text-slate-400">
                          {item.model}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {qaLoading && (
                  <div className="text-xs text-indigo-700 font-medium flex items-center gap-2 p-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>書類内容を照会して回答を生成中...</span>
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskDocumentQA();
                }}
                className="flex items-center gap-2 pt-3 border-t border-slate-100"
              >
                <input
                  type="text"
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  placeholder={`『${document.title.slice(0, 20)}...』について質問を入力...`}
                  className="flex-1 h-9 px-3.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
                  disabled={qaLoading}
                />
                <button
                  type="submit"
                  disabled={qaLoading || !qaInput.trim()}
                  className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>質問する</span>
                </button>
              </form>
            </div>
          )}

          {/* MODE 3: RELATED DOCUMENTS FINDER */}
          {viewMode === 'related' && (
            <div className="space-y-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
                <span className="font-semibold text-slate-900 block mb-0.5">
                  内容・キーワードが類似する校内関連書類
                </span>
                <span>
                  カテゴリ・タグ・本文類似度に基づき、関連性の高いマニュアルや記録を抽出しています。
                </span>
              </div>

              {loadingRelated ? (
                <div className="p-8 text-center text-xs text-slate-500">関連書類を検索中...</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {relatedDocs.map((rel) => (
                    <div
                      key={rel.id}
                      className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 flex items-center justify-between gap-4 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-medium text-indigo-700">{rel.category}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span>{rel.securityLevel}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                            関連度 {(rel.similarityScore * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {rel.title}
                        </div>
                        {rel.sharedKeywords.length > 0 && (
                          <div className="text-[11px] text-slate-500">
                            共通タグ: {rel.sharedKeywords.map((k) => `#${k}`).join(' ')}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSwitchDocument?.(rel.id)}
                        className="h-8 px-3 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                      >
                        <span>開く</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {relatedDocs.length === 0 && (
                    <div className="p-8 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-xl">
                      閲覧権限内で一致する関連書類が見つかりませんでした。
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MODE 4: UPDATE HISTORY & DIFF COMPARISON */}
          {viewMode === 'history' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-indigo-600" />
                    <span>更新履歴 ＆ 新旧バージョン差分比較</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    過去の版と最新版を比較し、基準変更や追記箇所を確認できます。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsEditingRevision(!isEditingRevision)}
                  className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingRevision ? '改訂入力を閉じる' : '新しい版として改訂'}</span>
                </button>
              </div>

              {isEditingRevision && (
                <div className="bg-white border border-indigo-200 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-900">
                    第{document.version + 1}版として内容を改訂保存（自動で仮名化・差分記録されます）
                  </div>
                  <input
                    type="text"
                    value={editChangeNote}
                    onChange={(e) => setEditChangeNote(e.target.value)}
                    placeholder="改訂理由・変更メモ（例: 令和7年度夏季対応基準への見直し）"
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600"
                  />
                  <textarea
                    rows={6}
                    value={editBodyText}
                    onChange={(e) => setEditBodyText(e.target.value)}
                    className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 leading-relaxed"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingRevision(false)}
                      className="h-8 px-3 text-xs text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveNewRevision}
                      disabled={isSavingRevision}
                      className="h-8 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
                    >
                      {isSavingRevision ? '保存中...' : `v${document.version + 1} として保存`}
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      比較元（旧版）
                    </label>
                    <select
                      value={oldRevVer}
                      onChange={(e) => setOldRevVer(Number(e.target.value))}
                      className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                    >
                      {revisions.map((r) => (
                        <option key={r.version} value={r.version}>
                          v{r.version} ({r.updatedAt}) - {r.changeNote}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      比較先（新版）
                    </label>
                    <select
                      value={newRevVer}
                      onChange={(e) => setNewRevVer(Number(e.target.value))}
                      className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs"
                    >
                      {revisions.map((r) => (
                        <option key={r.version} value={r.version}>
                          v{r.version} ({r.updatedAt}) - {r.changeNote}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-600">
                    <span>差分比較: v{oldRevObj?.version} → v{newRevObj?.version}</span>
                    <span>
                      <span className="text-emerald-700 font-semibold">+追加</span> /{' '}
                      <span className="text-rose-700 font-semibold">-削除・変更前</span>
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto font-mono text-xs divide-y divide-slate-100 bg-white">
                    {diffLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`px-3.5 py-1 whitespace-pre-wrap ${
                          line.type === 'added'
                            ? 'bg-emerald-50 text-emerald-900'
                            : line.type === 'removed'
                            ? 'bg-rose-50 text-rose-900 line-through'
                            : 'text-slate-600'
                        }`}
                      >
                        <span className="inline-block w-4 select-none font-bold">
                          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                        </span>
                        {line.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODE 5: ORIGINAL TEXT */}
          {viewMode === 'original' && (
            <div className="bg-white border border-rose-200 rounded-xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-rose-100 text-xs">
                <span className="font-semibold text-rose-800 flex items-center gap-1.5">
                  <Unlock className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>管理職認証済み：実名・住所・電話番号 原本データ</span>
                </span>
                <span className="text-rose-600 font-mono text-[11px]">
                  ※機密情報のため校外持出厳禁
                </span>
              </div>
              <div className="font-mono text-xs sm:text-[13px] text-slate-900 leading-relaxed whitespace-pre-wrap bg-slate-50 p-4 rounded-lg border border-slate-200">
                {document.originalText}
              </div>
            </div>
          )}

          {/* MODE 6: PII DETECTION LOG */}
          {viewMode === 'pii' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
                <h4 className="font-semibold text-slate-900 mb-1">
                  ローカル仮名化エンジンによる自動置換実績
                </h4>
                <p className="leading-relaxed">
                  書類取り込み時に個人情報を検出し、復元不可能な仮名化コードへ置換して校内ベクトルデータベースに保存しています。
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">検出区分</th>
                      <th className="px-4 py-3 text-left font-semibold">原本テキスト</th>
                      <th className="px-4 py-3 text-left font-semibold">仮名化コード</th>
                      <th className="px-4 py-3 text-left font-semibold">保護状態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(document.piiItems || []).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                          {item.type}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-rose-700">
                          {canViewOriginal ? item.original : '•••••••• (管理者のみ表示)'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-emerald-700 font-semibold">
                          {item.masked}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>保護完了</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MODE 7: EVIDENCE CITATION SNIPPETS */}
          {viewMode === 'evidence' && (
            <div className="space-y-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
                <span className="font-semibold text-slate-900 block mb-0.5">
                  エビデンス（根拠条項）確認ビュー
                </span>
                <span>
                  AIが回答を生成する際、根拠として参照する書類内の具体的ページおよび条項スニペットです。
                </span>
              </div>

              {(document.evidenceSnippets || []).map((ev, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 font-mono tabular-nums">
                      Page {ev.page} · {ev.section}
                    </span>
                    <span className="text-[11px] text-emerald-700 font-medium tabular-nums">
                      引用信頼度 98.4%
                    </span>
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-700 font-mono leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                    {ev.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Bottom Bar */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2 font-mono tabular-nums truncate">
            <span className="text-slate-400">DOC-ID: {document.id}</span>
            <span aria-hidden="true">·</span>
            <span>v{document.version}</span>
            <span aria-hidden="true">·</span>
            <span className="font-sans">校内ベクトルDB登録済</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
