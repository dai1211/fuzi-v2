import React from 'react';
import { Menu, UploadCloud, Bot } from 'lucide-react';
import { NavTab } from './Sidebar';

interface TopHeaderProps {
  currentTab: NavTab;
  onOpenMobileMenu: () => void;
  onOpenUpload: () => void;
  onToggleChat: () => void;
  isChatOpen: boolean;
  isStandaloneMode: boolean;
}

const PAGE_LABELS: Record<NavTab, string> = {
  documents: '書類ポータル',
  search: 'AIナレッジ検索',
  upload: '書類取込・カメラOCR',
  pii: '個人情報仮名化検証',
  trash: '削除（非表示書類管理）',
  contest: 'システム仕様・設計書',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentTab,
  onOpenMobileMenu,
  onOpenUpload,
  onToggleChat,
  isChatOpen,
  isStandaloneMode,
}) => {
  return (
    <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-xs border-b border-slate-200 shrink-0">
      <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
        {/* Left: Mobile Menu + Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="メニューを開く"
            className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 text-sm min-w-0 whitespace-nowrap">
            <span className="hidden sm:inline text-slate-400 font-medium">
              {isStandaloneMode ? 'オフライン環境' : '校内閉域LAN'}
            </span>
            <span className="hidden sm:inline text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="font-semibold text-slate-900 truncate">
              {PAGE_LABELS[currentTab]}
            </span>
          </div>
        </div>

        {/* Right: Primary Workspace Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleChat}
            className={`inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              isChatOpen
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            <Bot className="w-4 h-4 text-indigo-600" />
            <span>AIアシスタント</span>
          </button>

          <button
            type="button"
            onClick={onOpenUpload}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <UploadCloud className="w-4 h-4" />
            <span>新規書類取込</span>
          </button>
        </div>
      </div>
    </header>
  );
};
