import React from 'react';
import {
  FileText,
  Search,
  UploadCloud,
  ShieldCheck,
  BookOpen,
  Server,
  Bot,
  X,
  Trash2,
  Settings,
} from 'lucide-react';

export type NavTab = 'documents' | 'search' | 'upload' | 'pii' | 'trash' | 'contest';

interface SidebarProps {
  currentTab: NavTab;
  setCurrentTab: (tab: NavTab) => void;
  onOpenDiagnostics: () => void;
  onOpenChat: () => void;
  isStandaloneMode: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  showTrashCorner: boolean;
  deletedCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenDiagnostics,
  onOpenChat,
  isStandaloneMode,
  isMobileOpen,
  onCloseMobile,
  showTrashCorner,
  deletedCount,
}) => {
  const primaryNav: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'documents',
      label: '書類ポータル',
      icon: <FileText className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'search',
      label: 'AIナレッジ検索',
      icon: <Search className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'upload',
      label: '書類取込・OCR',
      icon: <UploadCloud className="w-4 h-4 shrink-0" />,
    },
  ];

  const toolNav: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'pii',
      label: '個人情報仮名化検証',
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'contest',
      label: 'システム仕様・設計書',
      icon: <BookOpen className="w-4 h-4 shrink-0" />,
    },
  ];

  const handleSelectTab = (tab: NavTab) => {
    setCurrentTab(tab);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64 select-none">
      {/* Brand Header */}
      <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => handleSelectTab('documents')}
          className="flex items-center gap-2.5 text-left min-w-0"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 tracking-tight truncate">
              紙対応
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              学校書類管理・AI検索
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="メニューを閉じる"
          className="lg:hidden p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Group 1: Main Operations */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 tracking-wide">
            書類業務
          </div>
          <nav className="space-y-1" aria-label="メインナビゲーション">
            {primaryNav.map((item) => {
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  <span className={active ? 'text-indigo-600' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Group 2: Security & Documentation */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 tracking-wide">
            検証・システム情報
          </div>
          <nav className="space-y-1" aria-label="検証および仕様ナビゲーション">
            {toolNav.map((item) => {
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  }`}
                >
                  <span className={active ? 'text-indigo-600' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                onOpenChat();
                onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium transition-colors whitespace-nowrap"
            >
              <Bot className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="truncate">AI対話アシスタント</span>
            </button>

            {showTrashCorner && (
              <button
                type="button"
                onClick={() => handleSelectTab('trash')}
                aria-current={currentTab === 'trash' ? 'page' : undefined}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors whitespace-nowrap ${
                  currentTab === 'trash'
                    ? 'bg-rose-50 text-rose-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Trash2
                    className={`w-4 h-4 shrink-0 ${
                      currentTab === 'trash' ? 'text-rose-600' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">削除</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-500">
                  {deletedCount}
                </span>
              </button>
            )}
          </nav>
        </div>
      </div>

      {/* Sidebar Footer: Server Diagnostics */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70 shrink-0">
        <button
          type="button"
          onClick={() => {
            onOpenDiagnostics();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-between px-3 py-2 text-xs bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
        >
          <span className="flex items-center gap-2 text-slate-700 font-medium truncate">
            <Settings className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">
              {isStandaloneMode ? '設定（オフライン）' : '設定・サーバー診断'}
            </span>
          </span>
          <span className="text-[11px] font-medium text-emerald-700 shrink-0">
            稼働中
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Permanent Sidebar */}
      <aside className="hidden lg:block shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
