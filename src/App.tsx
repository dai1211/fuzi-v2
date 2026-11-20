import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  UploadCloud,
  Folder,
  LayoutGrid,
  Table,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Sidebar, NavTab } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DocumentCard } from './components/DocumentCard';
import { DocumentTableView } from './components/DocumentTableView';
import { VoiceSearchButton } from './components/VoiceSearchButton';
import { DocumentViewerModal } from './components/DocumentViewerModal';
import { DocumentUploadModal } from './components/DocumentUploadModal';
import { AIChatSidebar } from './components/AIChatSidebar';
import { SystemDiagnosticsModal } from './components/SystemDiagnosticsModal';
import { RAGSearchView } from './components/RAGSearchView';
import { PIIMaskingLab } from './components/PIIMaskingLab';
import { ContestGuideModal } from './components/ContestGuideModal';
import { TrashCornerView } from './components/TrashCornerView';
import {
  SchoolDoc,
  DeletedSchoolDoc,
  CategoryType,
  SecurityLevel,
  ImportanceLevel,
  UserRole,
  ServerStatusInfo,
  BackupStatusInfo,
} from './types';

export default function App() {
  // Navigation & Role states
  const [currentTab, setCurrentTab] = useState<NavTab>('documents');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<UserRole>('校長・教頭');
  const [isStandaloneMode, setIsStandaloneMode] = useState<boolean>(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState<boolean>(false);

  // Data states
  const [documents, setDocuments] = useState<SchoolDoc[]>([]);
  const [deletedDocuments, setDeletedDocuments] = useState<DeletedSchoolDoc[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatusInfo | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Settings: visibility of 「削除」 corner (hidden by default, unlocked via Settings)
  const SHOW_TRASH_CORNER_KEY = 'school_ai_show_trash_corner';
  const [showTrashCorner, setShowTrashCorner] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return window.localStorage.getItem(SHOW_TRASH_CORNER_KEY) === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });

  // Filters & Layout
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | 'all'>('all');
  const [selectedSecurity, setSelectedSecurity] = useState<SecurityLevel | 'all'>('all');
  const [selectedImportance, setSelectedImportance] = useState<ImportanceLevel | 'all'>('all');
  const [viewLayout, setViewLayout] = useState<'grid' | 'table'>('grid');

  // Modals & Sidebars
  const [selectedDocForView, setSelectedDocForView] = useState<SchoolDoc | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState<boolean>(false);
  const [highlightSection, setHighlightSection] = useState<string | undefined>(undefined);

  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [targetDocForChat, setTargetDocForChat] = useState<SchoolDoc | null>(null);
  const [initialChatRequest, setInitialChatRequest] = useState<{
    docId?: string;
    prompt: string;
    requestId: number;
  } | null>(null);

  // Local backup states
  const [backupStatus, setBackupStatus] = useState<BackupStatusInfo | null>(null);
  const [isRunningBackup, setIsRunningBackup] = useState<boolean>(false);
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);

  const LOCAL_STORAGE_BACKUP_KEY = 'school_ai_local_backup_snapshot';

  const syncBrowserLocalStorageSnapshot = (docs: SchoolDoc[], timestamp: string) => {
    try {
      const safeSnapshot = {
        savedAt: timestamp,
        documentCount: docs.length,
        documents: docs.map((d) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          securityLevel: d.securityLevel,
          department: d.department,
          receivedFrom: d.receivedFrom,
          authorMasked: d.authorMasked,
          date: d.date,
          fiscalYear: d.fiscalYear,
          maskedText: d.maskedText,
          summary: d.summary,
          keywords: d.keywords,
          piiCount: d.piiCount,
          evidenceSnippets: d.evidenceSnippets,
        })),
      };
      window.localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(safeSnapshot));
    } catch (err) {
      console.warn('Browser localStorage backup sync skipped:', err);
    }
  };

  // Fetch documents, deleted documents, and server status
  const fetchDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch(`/api/documents?role=${encodeURIComponent(userRole)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const fetchDeletedDocuments = async () => {
    try {
      const res = await fetch(`/api/deleted-documents?role=${encodeURIComponent(userRole)}`);
      if (!res.ok) return;
      const data = await res.json();
      setDeletedDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to load deleted documents:', err);
    }
  };

  const fetchServerStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      const res = await fetch('/api/status');
      if (!res.ok) return;
      const data = await res.json();
      setServerStatus(data);
      if (data.backup) {
        setBackupStatus(data.backup);
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const fetchBackupStatus = async () => {
    try {
      const res = await fetch('/api/backup/status');
      if (res.ok) {
        const data: BackupStatusInfo = await res.json();
        setBackupStatus(data);
      }
    } catch (err) {
      console.error('Failed to load backup status:', err);
    }
  };

  const handleRunBackup = async () => {
    setIsRunningBackup(true);
    setBackupFeedback(null);
    try {
      const res = await fetch('/api/backup/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'バックアップに失敗しました');
      }
      setBackupStatus(data.status);
      const savedTime = data.record?.createdAt || new Date().toISOString();
      syncBrowserLocalStorageSnapshot(documents, savedTime);
      setBackupFeedback(
        `校内ローカルストレージおよび端末領域へバックアップを保存しました（${data.record.documentCount}件）`
      );
    } catch {
      const nowIso = new Date().toISOString();
      syncBrowserLocalStorageSnapshot(documents, nowIso);
      setBackupStatus((prev) => ({
        autoBackupEnabled: prev?.autoBackupEnabled ?? true,
        intervalMinutes: prev?.intervalMinutes ?? 60,
        lastBackupAt: nowIso,
        nextBackupAt: prev?.autoBackupEnabled
          ? new Date(Date.now() + (prev?.intervalMinutes ?? 60) * 60 * 1000).toISOString()
          : null,
        storagePath: 'ブラウザLocalStorage (オフラインモード)',
        backupCount: (prev?.backupCount ?? 0) + 1,
        totalSizeBytes: prev?.totalSizeBytes ?? 0,
        recentBackups: prev?.recentBackups ?? [],
      }));
      setBackupFeedback('端末ローカルストレージへバックアップを保存しました（オフライン保護）');
    } finally {
      setIsRunningBackup(false);
    }
  };

  const handleUpdateBackupConfig = async (autoBackupEnabled: boolean, intervalMinutes: number) => {
    setBackupFeedback(null);
    try {
      const res = await fetch('/api/backup/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoBackupEnabled, intervalMinutes }),
      });
      const data = await res.json();
      if (res.ok && data.status) {
        setBackupStatus(data.status);
        setBackupFeedback(
          autoBackupEnabled
            ? `自動バックアップ間隔を「${intervalMinutes >= 60 ? `${intervalMinutes / 60}時間` : `${intervalMinutes}分`}ごと」に更新しました`
            : '定期自動バックアップを停止しました'
        );
      }
    } catch (err) {
      console.error('Failed to update backup config:', err);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchDeletedDocuments();
    fetchServerStatus();
  }, [userRole]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_TRASH_CORNER_KEY, String(showTrashCorner));
    } catch {
      // ignore storage errors
    }
    if (!showTrashCorner && currentTab === 'trash') {
      setCurrentTab('documents');
    }
  }, [showTrashCorner, currentTab]);

  useEffect(() => {
    if (isDiagnosticsOpen) {
      fetchBackupStatus();
      setBackupFeedback(null);
    }
  }, [isDiagnosticsOpen]);

  useEffect(() => {
    if (!backupStatus?.autoBackupEnabled) return;
    const intervalMs = Math.max(1, backupStatus.intervalMinutes) * 60 * 1000;
    const timer = window.setInterval(() => {
      syncBrowserLocalStorageSnapshot(documents, new Date().toISOString());
      fetchBackupStatus();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [backupStatus?.autoBackupEnabled, backupStatus?.intervalMinutes, documents]);

  useEffect(() => {
    if (documents.length > 0 && backupStatus?.lastBackupAt) {
      syncBrowserLocalStorageSnapshot(documents, backupStatus.lastBackupAt);
    }
  }, [documents.length, backupStatus?.lastBackupAt]);

  const handleOpenDocEvidence = async (docId: string, section?: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (res.ok) {
        const doc = await res.json();
        setSelectedDocForView(doc);
        setHighlightSection(section);
        setIsViewerOpen(true);
        return;
      }
    } catch (err) {
      console.error(err);
    }
    const localDoc = documents.find((d) => d.id === docId);
    if (localDoc) {
      setSelectedDocForView(localDoc);
      setHighlightSection(section);
      setIsViewerOpen(true);
    }
  };

  const handleAskAIAboutDoc = (doc: SchoolDoc) => {
    setTargetDocForChat(doc);
    setIsChatOpen(true);
  };

  const handleAskAIWithQuery = (query: string, docId?: string) => {
    setInitialChatRequest({
      docId,
      prompt: query,
      requestId: Date.now(),
    });
    setIsChatOpen(true);
  };

  const handleDocumentAdded = (
    newDoc: SchoolDoc,
    isUpdate?: boolean,
    nextBackupStatus?: BackupStatusInfo
  ) => {
    let updatedList: SchoolDoc[] = [];
    setDocuments((prev) => {
      const exists = prev.some((d) => d.id === newDoc.id);
      updatedList =
        isUpdate || exists
          ? prev.map((d) => (d.id === newDoc.id ? newDoc : d))
          : [newDoc, ...prev];
      syncBrowserLocalStorageSnapshot(updatedList, new Date().toISOString());
      return updatedList;
    });
    if (nextBackupStatus) {
      setBackupStatus(nextBackupStatus);
    } else {
      fetchBackupStatus();
    }
    setActionNotice(
      `「${newDoc.title}」を保存し、校内ローカルストレージへ即時バックアップしました。`
    );
    setSelectedDocForView(newDoc);
    setHighlightSection(undefined);
    setIsViewerOpen(true);
  };

  const handleDocumentUpdated = (updatedDoc: SchoolDoc) => {
    setDocuments((prev) => {
      const nextList = prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d));
      syncBrowserLocalStorageSnapshot(nextList, new Date().toISOString());
      return nextList;
    });
    setSelectedDocForView(updatedDoc);
    fetchBackupStatus();
    setActionNotice(`「${updatedDoc.title}」の更新内容を即時バックアップ保存しました。`);
  };

  const handleDeleteDocument = async (doc: SchoolDoc) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');

      setDocuments((prev) => {
        const nextList = prev.filter((d) => d.id !== doc.id);
        syncBrowserLocalStorageSnapshot(nextList, new Date().toISOString());
        return nextList;
      });
      if (data.deletedDocument) {
        setDeletedDocuments((prev) => [
          data.deletedDocument,
          ...prev.filter((d) => d.id !== doc.id),
        ]);
      } else {
        fetchDeletedDocuments();
      }
      if (data.backupStatus) {
        setBackupStatus(data.backupStatus);
      }
      if (selectedDocForView?.id === doc.id) {
        setIsViewerOpen(false);
        setSelectedDocForView(null);
      }
      setActionNotice(
        `「${doc.title}」を削除して非表示にしました。（「設定」から「削除」コーナーを有効にして復元・完全削除できます）`
      );
    } catch (err: any) {
      setActionNotice(`削除処理エラー: ${err.message}`);
    }
  };

  const handleRestoreDocument = async (doc: DeletedSchoolDoc) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '復元に失敗しました');

      setDeletedDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      if (data.document) {
        setDocuments((prev) => {
          const nextList = [data.document, ...prev.filter((d) => d.id !== doc.id)];
          syncBrowserLocalStorageSnapshot(nextList, new Date().toISOString());
          return nextList;
        });
      } else {
        fetchDocuments();
      }
      if (data.backupStatus) {
        setBackupStatus(data.backupStatus);
      }
      setActionNotice(`「${doc.title}」を書類ポータルへ復元し、即時バックアップ保存しました。`);
    } catch (err: any) {
      setActionNotice(`復元エラー: ${err.message}`);
    }
  };

  const handlePermanentDeleteDocument = async (doc: DeletedSchoolDoc) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/permanent`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '完全削除に失敗しました');

      setDeletedDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      if (data.backupStatus) {
        setBackupStatus(data.backupStatus);
      }
      setActionNotice(`「${doc.title}」を完全に削除しました。`);
    } catch (err: any) {
      setActionNotice(`完全削除エラー: ${err.message}`);
    }
  };

  const handleOpenTrashCorner = () => {
    setShowTrashCorner(true);
    setIsDiagnosticsOpen(false);
    setCurrentTab('trash');
  };

  const handleSwitchDocument = async (docId: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (res.ok) {
        const doc = await res.json();
        setSelectedDocForView(doc);
        setHighlightSection(undefined);
        setIsViewerOpen(true);
        return;
      }
    } catch (err) {
      console.error('Failed to switch document:', err);
    }
    const localDoc = documents.find((d) => d.id === docId);
    if (localDoc) {
      setSelectedDocForView(localDoc);
      setHighlightSection(undefined);
      setIsViewerOpen(true);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedSecurity('all');
    setSelectedImportance('all');
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedCategory !== 'all' ||
    selectedSecurity !== 'all' ||
    selectedImportance !== 'all';

  // Filtered documents for portal view
  const filteredDocuments = documents.filter((doc) => {
    if (selectedCategory !== 'all' && doc.category !== selectedCategory) return false;
    if (selectedSecurity !== 'all' && doc.securityLevel !== selectedSecurity) return false;
    if (selectedImportance !== 'all' && doc.importance !== selectedImportance) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        doc.title.toLowerCase().includes(q) ||
        (doc.receivedFrom || '').toLowerCase().includes(q) ||
        doc.keywords.some((k) => k.toLowerCase().includes(q)) ||
        doc.summary.toLowerCase().includes(q) ||
        doc.department.toLowerCase().includes(q) ||
        (doc.deadlines || []).some(
          (dl) => dl.label.toLowerCase().includes(q) || dl.dateText.toLowerCase().includes(q)
        );
      if (!match) return false;
    }
    return true;
  });

  const categories: { name: CategoryType; label: string; count: number }[] = [
    { name: '行事マニュアル', label: '行事マニュアル', count: documents.filter((d) => d.category === '行事マニュアル').length },
    { name: '保健・安全', label: '保健・安全', count: documents.filter((d) => d.category === '保健・安全').length },
    { name: '学年経営', label: '学年経営', count: documents.filter((d) => d.category === '学年経営').length },
    { name: '生徒指導', label: '生徒指導', count: documents.filter((d) => d.category === '生徒指導').length },
    { name: 'PTA資料', label: 'PTA資料', count: documents.filter((d) => d.category === 'PTA資料').length },
    { name: '事務・予算', label: '事務・予算', count: documents.filter((d) => d.category === '事務・予算').length },
    { name: '定期考査・成績', label: '定期考査・成績', count: documents.filter((d) => d.category === '定期考査・成績').length },
  ];

  const urgentCount = documents.filter((d) => d.importance === '緊急・重要').length;

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-900">
      {/* Left Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        userRole={userRole}
        setUserRole={setUserRole}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenChat={() => setIsChatOpen(true)}
        isStandaloneMode={isStandaloneMode}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        showTrashCorner={showTrashCorner}
        deletedCount={deletedDocuments.length}
      />

      {/* Right Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          currentTab={currentTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onOpenUpload={() => setIsUploadOpen(true)}
          onToggleChat={() => setIsChatOpen(!isChatOpen)}
          isChatOpen={isChatOpen}
          isStandaloneMode={isStandaloneMode}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {actionNotice && (
            <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate sm:whitespace-normal">{actionNotice}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsDiagnosticsOpen(true)}
                  className="text-emerald-800 hover:underline font-semibold whitespace-nowrap"
                >
                  設定を開く
                </button>
                <button
                  type="button"
                  onClick={() => setActionNotice(null)}
                  aria-label="通知を閉じる"
                  className="p-1 text-emerald-700 hover:text-emerald-950 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: DOCUMENTS PORTAL */}
          {currentTab === 'documents' && (
            <div className="space-y-6">
              {/* Page Header */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    紙対応 書類ポータル
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    配布資料・行事要項・危機管理マニュアル・生徒指導記録を校内ローカル環境で安全に一元管理します。
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 tabular-nums shrink-0">
                  <span>
                    保管数: <strong className="font-mono text-slate-900">{documents.length}</strong>件
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>権限: <strong className="text-slate-800">{userRole}</strong></span>
                </div>
              </div>

              {/* Category Folders Grid */}
              <section aria-label="書類カテゴリ一覧">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      selectedCategory === 'all'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <Folder
                        className={`w-4 h-4 shrink-0 ${
                          selectedCategory === 'all' ? 'text-indigo-600' : 'text-slate-400'
                        }`}
                      />
                      <span className="text-[11px] font-mono tabular-nums text-slate-500">
                        {documents.length}
                      </span>
                    </div>
                    <div className="text-xs font-semibold truncate">すべて表示</div>
                  </button>

                  {categories.map((cat) => {
                    const active = selectedCategory === cat.name;
                    return (
                      <button
                        key={cat.name}
                        type="button"
                        onClick={() => setSelectedCategory(cat.name)}
                        className={`px-3 py-2.5 rounded-xl border text-left transition-colors ${
                          active
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <Folder
                            className={`w-4 h-4 shrink-0 ${
                              active ? 'text-indigo-600' : 'text-slate-400'
                            }`}
                          />
                          <span className="text-[11px] font-mono tabular-nums text-slate-500">
                            {cat.count}
                          </span>
                        </div>
                        <div className="text-xs font-semibold truncate">{cat.label}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Filter & Search Toolbar */}
              <section
                aria-label="検索と絞り込み"
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
              >
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                  {/* Search input + Voice Search */}
                  <div className="flex items-center gap-2 w-full xl:max-w-md">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="タイトル、受領元、タグ、期限、担当部署で絞り込み..."
                        className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-500/15 transition-colors"
                      />
                    </div>
                    <VoiceSearchButton onTranscript={(text) => setSearchQuery(text)} />
                  </div>

                  {/* Filters & Layout Switch */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Importance Filter */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                        重要度
                      </span>
                      <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-lg text-xs">
                        {(['all', '緊急・重要', '重要', '通常'] as const).map((imp) => (
                          <button
                            key={imp}
                            type="button"
                            onClick={() => setSelectedImportance(imp)}
                            className={`h-7 px-2.5 rounded-md transition-colors whitespace-nowrap font-medium ${
                              selectedImportance === imp
                                ? imp === '緊急・重要'
                                  ? 'bg-rose-600 text-white font-semibold'
                                  : imp === '重要'
                                  ? 'bg-amber-600 text-white font-semibold'
                                  : 'bg-white text-indigo-700 font-semibold shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {imp === 'all' ? 'すべて' : imp}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Security Filter */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                        秘匿度
                      </span>
                      <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-lg text-xs">
                        {(['all', '全校共有', '学年・部局限定', '機密'] as const).map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setSelectedSecurity(sec)}
                            className={`h-7 px-2.5 rounded-md transition-colors whitespace-nowrap font-medium ${
                              selectedSecurity === sec
                                ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {sec === 'all' ? 'すべて' : sec}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Layout Switch */}
                    <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-lg text-xs ml-auto xl:ml-0">
                      <button
                        type="button"
                        onClick={() => setViewLayout('grid')}
                        className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors whitespace-nowrap font-medium ${
                          viewLayout === 'grid'
                            ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>カード</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewLayout('table')}
                        className={`h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md transition-colors whitespace-nowrap font-medium ${
                          viewLayout === 'table'
                            ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Table className="w-3.5 h-3.5" />
                        <span>一覧表</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Documents List / Table */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
                  <div className="flex items-center gap-3">
                    <span>
                      該当書類:{' '}
                      <strong className="font-mono tabular-nums text-slate-900">
                        {filteredDocuments.length}
                      </strong>{' '}
                      件
                    </span>
                    {urgentCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-semibold tabular-nums">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>緊急・重要: {urgentCount}件</span>
                      </span>
                    )}
                  </div>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-800 font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>絞り込みを解除</span>
                    </button>
                  )}
                </div>

                {isLoadingDocs && documents.length === 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <div
                        key={n}
                        className="bg-white border border-slate-200 rounded-xl p-5 h-52 animate-pulse space-y-3"
                      >
                        <div className="h-3 bg-slate-100 rounded w-1/2" />
                        <div className="h-5 bg-slate-100 rounded w-5/6" />
                        <div className="h-3 bg-slate-100 rounded w-full" />
                        <div className="h-3 bg-slate-100 rounded w-2/3" />
                      </div>
                    ))}
                  </div>
                ) : viewLayout === 'table' ? (
                  <DocumentTableView
                    documents={filteredDocuments}
                    onSelect={(d) => {
                      setSelectedDocForView(d);
                      setHighlightSection(undefined);
                      setIsViewerOpen(true);
                    }}
                    onAskAI={(d) => handleAskAIAboutDoc(d)}
                    onDelete={handleDeleteDocument}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDocuments.map((doc) => (
                      <DocumentCard
                        key={doc.id}
                        doc={doc}
                        userRole={userRole}
                        onSelect={(d) => {
                          setSelectedDocForView(d);
                          setHighlightSection(undefined);
                          setIsViewerOpen(true);
                        }}
                        onAskAI={(d) => handleAskAIAboutDoc(d)}
                        onSelectTag={(tag) => setSearchQuery(tag)}
                        onDelete={handleDeleteDocument}
                      />
                    ))}
                  </div>
                )}

                {filteredDocuments.length === 0 && !isLoadingDocs && (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2.5" />
                    <p className="font-semibold text-slate-800 text-sm">
                      該当する書類がありません
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      絞り込み条件を変更するか、「新規書類取込」より書類を登録してください。
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="h-8 px-3.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                        >
                          絞り込みをリセット
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsUploadOpen(true)}
                        className="h-8 px-3.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                      >
                        新規書類を取込
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: AI RAG SEARCH */}
          {currentTab === 'search' && (
            <RAGSearchView
              userRole={userRole}
              onOpenDocEvidence={handleOpenDocEvidence}
              onAskAIWithQuery={handleAskAIWithQuery}
            />
          )}

          {/* TAB 3: DOCUMENT UPLOAD & CAMERA OCR */}
          {currentTab === 'upload' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  書類取込・カメラOCR
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  端末カメラでの紙書類撮影、テキスト入力、実務サンプルから取り込み、仮名化・重複検査までをローカルで実行します。
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-1.5 max-w-xl">
                  <div className="text-xs font-semibold text-indigo-700">
                    ローカルVLM AI-OCR 取り込みパイプライン
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">
                    書類スキャン・取り込みウィザード
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                    紙書類の手書き撮影やPDF・Office文書の内容を取り込み、個人情報の自動仮名化と期限・重要度の自動判定を行って校内書庫へ登録します。
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsUploadOpen(true)}
                  className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs sm:text-sm transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>取込ウィンドウを開く</span>
                </button>
              </div>

              {/* Workflow Step Explanation */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="text-xs font-mono font-semibold text-indigo-600">STEP 01</div>
                  <h3 className="text-sm font-bold text-slate-900">AI-OCR 構造化読取</h3>
                  <p className="text-slate-600 leading-relaxed">
                    手書き文字、図表、帳票レイアウトを完全ローカルの Ollama（Gemma 4 12B）が解析し、正確にテキスト化・構造化します。
                  </p>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="text-xs font-mono font-semibold text-emerald-600">STEP 02</div>
                  <h3 className="text-sm font-bold text-slate-900">個人情報自動仮名化</h3>
                  <p className="text-slate-600 leading-relaxed">
                    保存前に生徒・保護者・教員の氏名や電話番号を特定し、一意のIDコード（[生徒ID: S-1029]）へ置換します。
                  </p>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="text-xs font-mono font-semibold text-slate-600">STEP 03</div>
                  <h3 className="text-sm font-bold text-slate-900">校内DB・RAG蓄積</h3>
                  <p className="text-slate-600 leading-relaxed">
                    仮名化テキストのみを校内ベクトルデータベースへ保管。外部クラウド送信はゼロで情報漏洩を排除します。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PII MASKING LAB */}
          {currentTab === 'pii' && (
            <PIIMaskingLab
              onPiiBackedUp={(nextStatus) => {
                if (nextStatus) setBackupStatus(nextStatus);
              }}
            />
          )}

          {/* TAB 5: TRASH CORNER (UNLOCKED VIA SETTINGS) */}
          {currentTab === 'trash' && (
            <TrashCornerView
              deletedDocuments={deletedDocuments}
              onRestore={handleRestoreDocument}
              onPermanentDelete={handlePermanentDeleteDocument}
              onBackToPortal={() => setCurrentTab('documents')}
              onOpenSettings={() => setIsDiagnosticsOpen(true)}
            />
          )}

          {/* TAB 6: SYSTEM SPECIFICATION GUIDE */}
          {currentTab === 'contest' && <ContestGuideModal />}
        </main>
      </div>

      {/* Modals & Drawers */}
      <DocumentViewerModal
        document={selectedDocForView}
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setSelectedDocForView(null);
        }}
        userRole={userRole}
        highlightSection={highlightSection}
        onAskAIAboutDoc={handleAskAIAboutDoc}
        onSwitchDocument={handleSwitchDocument}
        onDocumentUpdated={handleDocumentUpdated}
        onDelete={handleDeleteDocument}
      />

      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onDocumentAdded={handleDocumentAdded}
      />

      <SystemDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        statusInfo={serverStatus}
        isStandaloneMode={isStandaloneMode}
        setIsStandaloneMode={setIsStandaloneMode}
        onRefreshStatus={fetchServerStatus}
        isRefreshingStatus={isRefreshingStatus}
        backupStatus={backupStatus}
        isRunningBackup={isRunningBackup}
        backupFeedback={backupFeedback}
        onRunBackup={handleRunBackup}
        onUpdateBackupConfig={handleUpdateBackupConfig}
        showTrashCorner={showTrashCorner}
        setShowTrashCorner={setShowTrashCorner}
        deletedCount={deletedDocuments.length}
        onOpenTrashCorner={handleOpenTrashCorner}
      />

      <AIChatSidebar
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        userRole={userRole}
        documents={documents}
        onOpenDocEvidence={handleOpenDocEvidence}
        targetDocForChat={targetDocForChat}
        clearTargetDoc={() => setTargetDocForChat(null)}
        initialChatRequest={initialChatRequest}
        clearInitialChatRequest={() => setInitialChatRequest(null)}
      />
    </div>
  );
}
