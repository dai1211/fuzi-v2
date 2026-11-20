import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Bot,
  User,
  Copy,
  Check,
  FileText,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { ChatMessage, SchoolDoc, UserRole } from '../types';

interface ChatRequestPayload {
  docId?: string;
  prompt: string;
  requestId: number;
}

interface AIChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: UserRole;
  documents: SchoolDoc[];
  onOpenDocEvidence: (docId: string, section?: string) => void;
  targetDocForChat: SchoolDoc | null;
  clearTargetDoc: () => void;
  initialChatRequest?: ChatRequestPayload | null;
  clearInitialChatRequest?: () => void;
}

export const AIChatSidebar: React.FC<AIChatSidebarProps> = ({
  isOpen,
  onClose,
  userRole,
  documents,
  onOpenDocEvidence,
  targetDocForChat,
  clearTargetDoc,
  initialChatRequest,
  clearInitialChatRequest,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'ai',
      text: `校内ローカルAIアシスタントです（Ollama / Gemma 4 12B 校内オンプレミス推論）。
校内LAN内の保管文書から、個人情報を保護（仮名化）した文脈で、行事マニュアル、感染症対応、生徒指導、会計規定などを回答します。

気になる点や作成したい文案があればお尋ねください。`,
      timestamp: '現在',
      isLocal: true,
      modelUsed: 'Ollama / Gemma 4 12B (校内専用)',
    },
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const [activeTargetDocId, setActiveTargetDocId] = useState<string>('');

  // Clear selection if selected document was deleted/hidden
  useEffect(() => {
    if (activeTargetDocId && !documents.some((d) => d.id === activeTargetDocId)) {
      setActiveTargetDocId('');
    }
  }, [documents, activeTargetDocId]);

  useEffect(() => {
    if (targetDocForChat) {
      const docId = targetDocForChat.id;
      setActiveTargetDocId(docId);
      const prompt = `『${targetDocForChat.title}』の重要ポイントを要約し、教員が注意すべき対応手順を教えてください。`;
      handleSendMessage(prompt, docId);
      clearTargetDoc();
    }
  }, [targetDocForChat]);

  useEffect(() => {
    if (initialChatRequest) {
      const docId = initialChatRequest.docId || '';
      setActiveTargetDocId(docId);
      if (initialChatRequest.prompt.trim()) {
        handleSendMessage(initialChatRequest.prompt, docId || undefined);
      }
      clearInitialChatRequest?.();
    }
  }, [initialChatRequest]);

  const handleSendMessage = async (textToSend?: string, overrideDocId?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: queryText,
          userRole,
          targetDocId: (overrideDocId ?? activeTargetDocId) || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('サーバー応答エラー');
      }

      const data = await res.json();
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: data.response,
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed,
        isLocal: data.isLocal,
        inferenceTimeMs: data.inferenceTimeMs,
        referencedDocs: data.referencedDocs,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: '校内ローカルAIサーバーとの通信に一時的な問題が発生しました。再度お試しください。',
        timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const activeTargetDoc = documents.find((d) => d.id === activeTargetDocId) || null;

  const quickPrompts = activeTargetDoc
    ? [
        `『${activeTargetDoc.title.slice(0, 18)}』の要点を3つで要約して`,
        `『${activeTargetDoc.title.slice(0, 18)}』の期限・連絡先・注意点は？`,
        `『${activeTargetDoc.title.slice(0, 18)}』の具体的な対応手順を教えて`,
        `この書類をもとに職員朝礼・週報用の共有文を作成して`,
      ]
    : [
        '体育祭のWBGT 31度以上の対応手順は？',
        'インフルエンザ出席停止と学級閉鎖の基準は？',
        '修学旅行のアレルギー生徒対応とエピペン携行ルール',
        'PTA役員の選出ルールと会費改定内容',
      ];

  if (!isOpen) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-[460px] bg-white border-l border-slate-200 shadow-xl flex flex-col">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight truncate">
              校内AI対話アシスタント
            </h3>
            <p className="text-[11px] text-slate-500 truncate">
              ローカルRAG · 外部データ送信遮断
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="アシスタントを閉じる"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Target Manual / Document Selector */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 space-y-1.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="ai-chat-target-doc"
            className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>対話対象のマニュアル・書類を選択</span>
          </label>
          {activeTargetDoc && (
            <button
              type="button"
              onClick={() => setActiveTargetDocId('')}
              className="text-[11px] text-indigo-700 hover:text-indigo-900 font-medium whitespace-nowrap"
            >
              全書類対象に戻す
            </button>
          )}
        </div>

        <select
          id="ai-chat-target-doc"
          value={activeTargetDocId}
          onChange={(e) => setActiveTargetDocId(e.target.value)}
          className="w-full h-9 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
        >
          <option value="">すべての保管書類（横断RAG検索）</option>
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              [{doc.category}] {doc.title}
            </option>
          ))}
        </select>

        {activeTargetDoc && (
          <div className="text-[11px] text-indigo-700 font-medium flex items-center justify-between gap-2 px-0.5">
            <span className="truncate">
              選択中の資料に基づいて回答します（{activeTargetDoc.department}）
            </span>
            <button
              type="button"
              onClick={() => onOpenDocEvidence(activeTargetDoc.id)}
              className="underline hover:text-indigo-900 shrink-0"
            >
              本文確認
            </button>
          </div>
        )}
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 overflow-x-auto flex gap-1.5 shrink-0">
        {quickPrompts.map((qp, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSendMessage(qp)}
            className="text-[11px] bg-slate-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors"
          >
            {qp}
          </button>
        ))}
      </div>

      {/* Message History */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50 text-xs sm:text-[13px]">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400 px-1">
              {m.sender === 'user' ? (
                <>
                  <span>教員（{userRole}）</span>
                  <User className="w-3 h-3 text-slate-400" />
                </>
              ) : (
                <>
                  <Bot className="w-3 h-3 text-indigo-600" />
                  <span className="font-medium text-slate-600">校内AIアシスタント</span>
                  {m.inferenceTimeMs && (
                    <span className="font-mono tabular-nums text-slate-400">
                      ({m.inferenceTimeMs}ms)
                    </span>
                  )}
                </>
              )}
            </div>

            <div
              className={`p-3.5 rounded-xl max-w-[92%] leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-800 border border-slate-200'
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>

              {m.referencedDocs && m.referencedDocs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>引用された校内根拠文書:</span>
                  </div>
                  <div className="space-y-1.5">
                    {m.referencedDocs.map((refDoc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onOpenDocEvidence(refDoc.id, refDoc.evidence?.section)}
                        className="w-full text-left bg-slate-50 hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-200 text-slate-800 rounded-lg p-2.5 text-xs flex items-center justify-between group transition-colors"
                      >
                        <div className="flex flex-col truncate pr-2">
                          <span className="font-semibold truncate text-[11px] text-slate-900">
                            {refDoc.title}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {refDoc.evidence?.section || '該当条項'} (p.{refDoc.evidence?.page || 1})
                          </span>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {m.sender === 'ai' && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] gap-2">
                  <span className="text-slate-400 font-mono text-[10px] truncate">
                    {m.modelUsed || 'Ollama / Gemma 4 12B'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(m.id, m.text)}
                    className="inline-flex items-center gap-1 text-slate-500 hover:text-indigo-700 font-medium px-2 py-0.5 rounded hover:bg-slate-50 transition-colors shrink-0"
                  >
                    {copiedId === m.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700">コピー済</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-slate-400" />
                        <span>週報用にコピー</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-2 text-slate-500 text-xs">
            <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
              <span>校内ベクトルDB照会・推論中...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3.5 border-t border-slate-200 bg-white shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              activeTargetDoc
                ? `『${activeTargetDoc.title.slice(0, 16)}...』について質問を入力...`
                : '校内文書について質問を入力...'
            }
            className="flex-1 h-9 px-3.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-500/15 transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="送信"
            className="h-9 w-9 inline-flex items-center justify-center text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-[11px] text-slate-400 mt-2 text-center">
          外部クラウド送信なし · 仮名化済みデータのみを参照
        </p>
      </div>
    </aside>
  );
};
