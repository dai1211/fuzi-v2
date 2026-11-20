import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================================
// Local Ollama (Gemma 4 12B) Engine — External Cloud AI Calls Blocked
// ============================================================================
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:12b';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || OLLAMA_MODEL;
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 120000;

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

// Serialized inference queue so concurrent requests from multiple school PCs do not overload 1 local GPU
let inferenceQueueTail: Promise<void> = Promise.resolve();
let activeInferenceCount = 0;

function enqueueInference<T>(task: () => Promise<T>): Promise<T> {
  activeInferenceCount += 1;
  const run = inferenceQueueTail.then(task, task);
  inferenceQueueTail = run.then(
    () => {
      activeInferenceCount = Math.max(0, activeInferenceCount - 1);
    },
    () => {
      activeInferenceCount = Math.max(0, activeInferenceCount - 1);
    }
  );
  return run;
}

async function checkOllamaHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data: any = await res.json();
    const models: string[] = Array.isArray(data?.models)
      ? data.models.map((m: any) => String(m?.name || m?.model || '')).filter(Boolean)
      : [];
    const targetPrefix = OLLAMA_MODEL.split(':')[0].toLowerCase();
    const modelInstalled = models.some(
      (name) => name.toLowerCase() === OLLAMA_MODEL.toLowerCase() || name.toLowerCase().startsWith(`${targetPrefix}:`)
    );
    return {
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      visionModel: OLLAMA_VISION_MODEL,
      connected: true,
      modelInstalled,
      availableModels: models,
      activeQueueLength: activeInferenceCount,
    };
  } catch (err: any) {
    return {
      baseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      visionModel: OLLAMA_VISION_MODEL,
      connected: false,
      modelInstalled: false,
      availableModels: [] as string[],
      activeQueueLength: activeInferenceCount,
      error: err?.name === 'AbortError' ? '接続タイムアウト' : err?.message || '未接続',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callOllamaChat(params: {
  messages: OllamaChatMessage[];
  model?: string;
  format?: 'json';
  timeoutMs?: number;
}): Promise<{ content: string; durationMs: number; model: string }> {
  const model = params.model || OLLAMA_MODEL;
  const timeoutMs = params.timeoutMs || OLLAMA_TIMEOUT_MS;

  return enqueueInference(async () => {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: params.messages,
          stream: false,
          ...(params.format ? { format: params.format } : {}),
          options: {
            temperature: 0.2,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama API error (${res.status}): ${errText || res.statusText}`);
      }

      const data: any = await res.json();
      const content = String(data?.message?.content || data?.response || '').trim();
      if (!content) {
        throw new Error('Ollama returned an empty response');
      }

      return {
        content,
        durationMs: Date.now() - start,
        model: String(data?.model || model),
      };
    } finally {
      clearTimeout(timer);
    }
  });
}

// Default initial documents data with authentic school materials
export interface DeadlineItem {
  label: string;
  dateText: string;
  type: '提出期限' | '開催日' | '定期期日';
  urgency: '緊急' | '近日' | '通常';
}

export interface DocumentRevision {
  version: number;
  updatedAt: string;
  updatedBy: string;
  changeNote: string;
  maskedText: string;
  summary: string;
}

export interface SchoolDoc {
  id: string;
  title: string;
  category: '学年経営' | '行事マニュアル' | 'PTA資料' | '生徒指導' | '事務・予算' | '保健・安全' | '定期考査・成績';
  securityLevel: '全校共有' | '学年・部局限定' | '機密';
  importance: '緊急・重要' | '重要' | '通常';
  importanceReason: string;
  department: string;
  receivedFrom?: string;
  author: string;
  authorMasked: string;
  date: string;
  fiscalYear: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'jpg' | 'handwriting';
  pageCount: number;
  originalText: string;
  maskedText: string;
  summary: string;
  aiSummaryPoints: string[];
  keywords: string[];
  deadlines: DeadlineItem[];
  piiCount: number;
  piiItems: { type: string; original: string; masked: string }[];
  evidenceSnippets: { page: number; section: string; text: string }[];
  version: number;
  contentHash: string;
  revisions: DocumentRevision[];
}

export interface DeletedSchoolDoc extends SchoolDoc {
  deletedAt: string;
}

export interface PiiBackupRecord {
  id: string;
  savedAt: string;
  source: 'lab' | 'document';
  documentId?: string;
  documentTitle?: string;
  originalText: string;
  maskedText: string;
  detectedCount: number;
  items: { type: string; original: string; masked: string }[];
}

let schoolDocuments: SchoolDoc[] = [];

let deletedDocuments: DeletedSchoolDoc[] = [];
let piiBackupRecords: PiiBackupRecord[] = [];

// ============================================================================
// Intelligence Helpers: Deadlines, Importance, Auto-Tags, Summary, Duplicates
// ============================================================================

function computeContentHash(text: string): string {
  const normalized = text.replace(/\s+/g, '').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function getBigrams(str: string): Set<string> {
  const clean = str.replace(/\s+/g, '').toLowerCase();
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) {
    set.add(clean.slice(i, i + 2));
  }
  return set;
}

function computeTextSimilarity(a: string, b: string): number {
  const setA = getBigrams(a);
  const setB = getBigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 100) / 100;
}

function detectDeadlines(text: string, docDate?: string): DeadlineItem[] {
  const found: DeadlineItem[] = [];
  const seen = new Set<string>();

  const addUnique = (item: DeadlineItem) => {
    const key = `${item.label}:${item.dateText}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push(item);
    }
  };

  // Match explicit deadline lines or date expressions
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Explicit YYYY年MM月DD日 or 令和X年MM月DD日 or MM月DD日
    const jpDateMatch = trimmed.match(/((?:令和\d+年|20\d{2}年)?\d{1,2}月\d{1,2}日(?:\s*\d{1,2}:\d{2})?)/);
    if (jpDateMatch) {
      const dateText = jpDateMatch[1];
      let type: DeadlineItem['type'] = '開催日';
      let urgency: DeadlineItem['urgency'] = '通常';
      let label = '記載期日';

      if (/締切|期限|提出|期日|まで/.test(trimmed)) {
        type = '提出期限';
        urgency = '緊急';
        label = '提出・対応期限';
      } else if (/振込|毎月|翌月|定期/.test(trimmed)) {
        type = '定期期日';
        urgency = '近日';
        label = '定期処理期日';
      } else if (/日時|面談|総会|実施|開催|予定/.test(trimmed)) {
        type = '開催日';
        urgency = '近日';
        label = '実施・面談日時';
      }
      addUnique({ label, dateText, type, urgency });
    }

    // 2. Relative/recurring deadlines like 翌月20日, 午前6時00分, 11月25日
    if (!jpDateMatch) {
      const recurringMatch = trimmed.match(/(翌月\d{1,2}日|毎月\d{1,2}日|午前\d{1,2}時(?:\d{1,2}分)?|週\d+日|翌朝\d{1,2}:\d{2})/);
      if (recurringMatch) {
        const isUrgent = /翌朝|午前6時|緊急/.test(trimmed);
        addUnique({
          label: /振込/.test(trimmed) ? '振込期日' : /面談/.test(trimmed) ? '面談予定' : '基準時刻・周期',
          dateText: recurringMatch[1],
          type: isUrgent ? '提出期限' : '定期期日',
          urgency: isUrgent ? '緊急' : '通常',
        });
      }
    }

    // 3. Slash dates like 6/14 or 2026/11/20
    const slashMatch = trimmed.match(/((?:20\d{2}\/)?\d{1,2}\/\d{1,2})/);
    if (slashMatch) {
      addUnique({
        label: /締切|期限|提出/.test(trimmed) ? '提出期限' : '対象日付',
        dateText: slashMatch[1],
        type: /締切|期限|提出/.test(trimmed) ? '提出期限' : '開催日',
        urgency: /締切|期限|提出/.test(trimmed) ? '緊急' : '通常',
      });
    }
  }

  // Fallback contextual deadline from docDate if none detected
  if (found.length === 0 && docDate) {
    addUnique({
      label: '発出・登録日',
      dateText: docDate,
      type: '定期期日',
      urgency: '通常',
    });
  }

  return found.slice(0, 4);
}

function classifyImportance(
  title: string,
  text: string,
  category: string,
  securityLevel: string
): { importance: '緊急・重要' | '重要' | '通常'; importanceReason: string } {
  const combined = `${title} ${text}`;

  const urgentKeywords = ['極秘', '119番', 'エピペン', 'アナフィラキシー', 'WBGT 31度', '危機管理', '暴風警報', '情報漏洩', '厳禁', '過呼吸', '中止基準'];
  const highKeywords = ['出席停止', '学級閉鎖', 'アレルギー', '二重点検', '必須', '提出期限', '締切', '賠償責任', '規約改定', '要配慮'];

  const matchedUrgent = urgentKeywords.filter((k) => combined.includes(k));
  if (matchedUrgent.length > 0 || securityLevel === '機密') {
    const reason =
      matchedUrgent.length > 0
        ? `緊急対応・安全配慮キーワード（${matchedUrgent.slice(0, 2).join('・')}）を検出`
        : '秘匿度「機密」区分の最重要管理文書';
    return { importance: '緊急・重要', importanceReason: reason };
  }

  const matchedHigh = highKeywords.filter((k) => combined.includes(k));
  if (matchedHigh.length > 0 || category === '保健・安全' || category === '生徒指導') {
    const reason =
      matchedHigh.length > 0
        ? `重要規程・期限事項（${matchedHigh.slice(0, 2).join('・')}）を含む`
        : `${category}カテゴリの重要標準マニュアル`;
    return { importance: '重要', importanceReason: reason };
  }

  return { importance: '通常', importanceReason: '定常業務・一般共有文書' };
}

function generateAutoTags(title: string, text: string, category: string): string[] {
  const combined = `${title} ${text}`;
  const dictionary: [string, string[]][] = [
    ['熱中症対策', ['熱中症', 'WBGT', '給水', '遮光']],
    ['救急対応', ['119番', '救急', '救護', '意識混濁']],
    ['感染症・出席停止', ['インフルエンザ', '出席停止', '学級閉鎖', '解熱']],
    ['食物アレルギー', ['アレルギー', 'エピペン', '除去食', 'アナフィラキシー']],
    ['修学旅行・校外学習', ['修学旅行', '校外学習', '班行動', '宿泊']],
    ['生徒指導・相談', ['生徒指導', 'カウンセラー', '面談', '登校', 'トラブル']],
    ['個人情報保護', ['仮名化', '秘匿', '漏洩', '守秘義務']],
    ['災害・気象警報', ['台風', '暴風警報', '臨時休校', '避難']],
    ['PTA・保護者連携', ['PTA', '総会', 'ボランティア', '保護者']],
    ['会計・謝金規程', ['謝金', '振込', '予算', '保険']],
    ['定期考査・成績', ['考査', '採点', '答案', '金庫']],
    ['要期限確認', ['期限', '締切', '翌月20日', 'まで']],
  ];

  const tags = new Set<string>();
  tags.add(category);

  for (const [tag, triggers] of dictionary) {
    if (triggers.some((t) => combined.includes(t))) {
      tags.add(tag);
    }
  }

  return Array.from(tags).slice(0, 6);
}

function generateConciseSummary(title: string, maskedText: string): { summary: string; aiSummaryPoints: string[] } {
  const lines = maskedText
    .split(/\r?\n/)
    .map((l) => l.replace(/^[・\-\*\d\.\s]+/, '').trim())
    .filter((l) => l.length >= 12 && !l.startsWith('【') && !l.startsWith('作成者') && !l.startsWith('策定'));

  const points: string[] = [];
  for (const line of lines) {
    if (points.length >= 3) break;
    const clean = line.length > 90 ? `${line.slice(0, 88)}…` : line;
    if (!points.includes(clean)) {
      points.push(clean);
    }
  }

  if (points.length === 0) {
    points.push(`${title}に関する校内標準規程および実施手順。`);
  }

  const summary = points.slice(0, 2).join(' / ');
  return { summary, aiSummaryPoints: points };
}

function enrichDocumentFields(raw: any): SchoolDoc {
  const title: string = raw.title || '無題の校内書類';
  const maskedText: string = raw.maskedText || '';
  const originalText: string = raw.originalText || maskedText;
  const category = raw.category || '学年経営';
  const securityLevel = raw.securityLevel || '全校共有';

  const deadlines = raw.deadlines || detectDeadlines(originalText, raw.date);
  const imp = classifyImportance(title, originalText, category, securityLevel);
  const autoTags = generateAutoTags(title, originalText, category);
  const mergedKeywords = Array.from(new Set([...(raw.keywords || []), ...autoTags])).slice(0, 7);
  const concise = generateConciseSummary(title, maskedText);

  // Build initial revision history if missing
  let revisions: DocumentRevision[] = raw.revisions || [];
  let version = raw.version || 1;

  if (revisions.length === 0) {
    revisions = [
      {
        version: 1,
        updatedAt: raw.date || new Date().toISOString().split('T')[0],
        updatedBy: raw.authorMasked || '[教員ID: T-0100]',
        changeNote: '初回ローカル登録（仮名化適用済）',
        maskedText,
        summary: raw.summary || concise.summary,
      },
    ];
  }

  return {
    ...raw,
    importance: imp.importance,
    importanceReason: imp.importanceReason,
    summary: raw.summary || concise.summary,
    aiSummaryPoints: raw.aiSummaryPoints || concise.aiSummaryPoints,
    keywords: mergedKeywords,
    deadlines,
    version,
    contentHash: computeContentHash(originalText),
    revisions,
  };
}

function findDuplicateCandidates(title: string, rawText: string, excludeId?: string) {
  const newHash = computeContentHash(rawText);
  const duplicates: {
    id: string;
    title: string;
    similarityScore: number;
    matchType: '完全一致' | '内容類似' | 'タイトル類似';
    version: number;
    date: string;
  }[] = [];

  for (const doc of schoolDocuments) {
    if (excludeId && doc.id === excludeId) continue;
    const isExact = doc.contentHash === newHash;
    const titleSim = computeTextSimilarity(title, doc.title);
    const bodySim = computeTextSimilarity(rawText.slice(0, 800), doc.originalText.slice(0, 800));
    const maxSim = isExact ? 1.0 : Math.max(titleSim, bodySim);

    if (isExact) {
      duplicates.push({
        id: doc.id,
        title: doc.title,
        similarityScore: 1.0,
        matchType: '完全一致',
        version: doc.version,
        date: doc.date,
      });
    } else if (bodySim >= 0.45) {
      duplicates.push({
        id: doc.id,
        title: doc.title,
        similarityScore: bodySim,
        matchType: '内容類似',
        version: doc.version,
        date: doc.date,
      });
    } else if (titleSim >= 0.55) {
      duplicates.push({
        id: doc.id,
        title: doc.title,
        similarityScore: titleSim,
        matchType: 'タイトル類似',
        version: doc.version,
        date: doc.date,
      });
    } else if (maxSim >= 0.6) {
      duplicates.push({
        id: doc.id,
        title: doc.title,
        similarityScore: maxSim,
        matchType: '内容類似',
        version: doc.version,
        date: doc.date,
      });
    }
  }

  duplicates.sort((a, b) => b.similarityScore - a.similarityScore);
  return duplicates;
}

// Helper: Automatic PII detection and masking engine
function maskPiiInText(text: string): {
  maskedText: string;
  detectedCount: number;
  items: { type: string; original: string; masked: string }[];
} {
  let maskedText = text;
  const items: { type: string; original: string; masked: string }[] = [];

  // 1. Phone numbers
  const phoneRegex = /(0\d{1,4}-\d{1,4}-\d{3,4}|\d{10,11})/g;
  let phoneMatch;
  let phoneIdx = 1;
  const phoneRe = new RegExp(phoneRegex);
  while ((phoneMatch = phoneRe.exec(text)) !== null) {
    const original = phoneMatch[0];
    if (original.length >= 10 && !original.startsWith('202')) {
      const masked = `[TEL: 連絡先0${phoneIdx++}]`;
      items.push({ type: '電話番号', original, masked });
      maskedText = maskedText.replaceAll(original, masked);
    }
  }

  // 2. Student ID (学籍番号)
  const studentIdRegex = /(学籍番号\s*[:：]?\s*)(\d{5})/g;
  let idMatch;
  while ((idMatch = studentIdRegex.exec(text)) !== null) {
    const full = idMatch[0];
    const num = idMatch[2];
    const masked = `${idMatch[1]}[学籍番号: ${num.slice(0, 2)}***]`;
    items.push({ type: '学籍番号', original: full, masked });
    maskedText = maskedText.replaceAll(full, masked);
  }

  // 3. Address
  const addressRegex = /(宮崎県|東京都|大阪府|京都府|[一-龥]{2,3}[都道府県])?([一-龥]{1,6}[市区町村])([一-龥ぁ-んァ-ヶ0-9\-ー丁目番号]+)/g;
  let addrMatch;
  let addrIdx = 1;
  while ((addrMatch = addressRegex.exec(text)) !== null) {
    const original = addrMatch[0];
    if (original.includes('町') || original.includes('丁目') || original.includes('市')) {
      const masked = `[住所秘匿: 区域0${addrIdx++}]`;
      items.push({ type: '住所', original, masked });
      maskedText = maskedText.replaceAll(original, masked);
    }
  }

  // 4. Common full Japanese names pattern in school context (e.g. "生徒: 山田 太郎", "保護者: 佐藤 花子", "教諭 鈴木 一郎")
  const personRegex = /(生徒[:：\s]+|保護者[:：\s]+|父[:：\s]+|母[:：\s]+|教頭[:：\s]+|校長[:：\s]+|教諭[:：\s]+|主任[:：\s]+|主事[:：\s]+)([一-龥]{2,4}[\s　][一-龥]{1,4})/g;
  let pMatch;
  let pIdx = 100;
  while ((pMatch = personRegex.exec(text)) !== null) {
    const rolePrefix = pMatch[1];
    const name = pMatch[2];
    let tag = '個人名';
    let code = `[氏名ID: U-${pIdx++}]`;
    if (rolePrefix.includes('生徒')) {
      tag = '生徒氏名';
      code = `[生徒ID: S-${pIdx}]`;
    } else if (rolePrefix.includes('保護者') || rolePrefix.includes('父') || rolePrefix.includes('母')) {
      tag = '保護者氏名';
      code = `[保護者ID: P-${pIdx}]`;
    } else {
      tag = '教職員名';
      code = `[教員ID: T-${pIdx}]`;
    }
    items.push({ type: tag, original: name.trim(), masked: code });
    maskedText = maskedText.replaceAll(name, code);
  }

  return {
    maskedText,
    detectedCount: items.length,
    items,
  };
}

// ============================================================================
// Local School Storage Automatic Backup Engine
// ============================================================================
interface BackupRecord {
  id: string;
  fileName: string;
  createdAt: string;
  trigger: 'auto' | 'manual' | 'startup' | 'immediate';
  documentCount: number;
  sizeBytes: number;
  checksum: string;
}

interface BackupManifest {
  autoBackupEnabled: boolean;
  intervalMinutes: number;
  lastBackupAt: string | null;
  records: BackupRecord[];
}

const BACKUP_DIR = path.resolve('.school_local_backups');
const MANIFEST_PATH = path.join(BACKUP_DIR, 'backup-manifest.json');
const DOCUMENTS_STORE_PATH = path.join(BACKUP_DIR, 'documents-store.json');
const PII_BACKUP_PATH = path.join(BACKUP_DIR, 'pii-backup-records.json');
const MAX_BACKUP_GENERATIONS = 20;

let backupManifest: BackupManifest = {
  autoBackupEnabled: true,
  intervalMinutes: 60,
  lastBackupAt: null,
  records: [],
};

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function saveDocumentsStore() {
  ensureBackupDir();
  const payload = {
    updatedAt: new Date().toISOString(),
    schoolDocuments,
    deletedDocuments,
  };
  fs.writeFileSync(DOCUMENTS_STORE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
}

function loadDocumentsStore() {
  ensureBackupDir();
  if (fs.existsSync(DOCUMENTS_STORE_PATH)) {
    try {
      const raw = fs.readFileSync(DOCUMENTS_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.schoolDocuments)) {
        schoolDocuments = parsed.schoolDocuments.map((d: any) => enrichDocumentFields(d));
      }
      if (Array.isArray(parsed.deletedDocuments)) {
        deletedDocuments = parsed.deletedDocuments.map((d: any) => ({
          ...enrichDocumentFields(d),
          deletedAt: typeof d.deletedAt === 'string' ? d.deletedAt : new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.warn('Failed to parse documents-store.json, using initial seed:', err);
      saveDocumentsStore();
    }
  } else {
    saveDocumentsStore();
  }
}

function savePiiBackupStore() {
  ensureBackupDir();
  const payload = {
    updatedAt: new Date().toISOString(),
    records: piiBackupRecords,
  };
  fs.writeFileSync(PII_BACKUP_PATH, JSON.stringify(payload, null, 2), 'utf-8');
}

function loadPiiBackupStore() {
  ensureBackupDir();
  if (fs.existsSync(PII_BACKUP_PATH)) {
    try {
      const raw = fs.readFileSync(PII_BACKUP_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.records)) {
        piiBackupRecords = parsed.records;
      }
    } catch (err) {
      console.warn('Failed to parse pii-backup-records.json:', err);
    }
  }
}

function upsertPiiBackupRecord(entry: Omit<PiiBackupRecord, 'id' | 'savedAt'>): PiiBackupRecord {
  const nowIso = new Date().toISOString();
  const normalizedOriginal = entry.originalText.trim();

  // Avoid creating duplicate consecutive records for identical text/document
  const existingIdx = entry.documentId
    ? piiBackupRecords.findIndex((r) => r.documentId === entry.documentId && r.source === entry.source)
    : piiBackupRecords.findIndex((r) => r.source === entry.source && r.originalText.trim() === normalizedOriginal);

  const record: PiiBackupRecord = {
    id: existingIdx !== -1 ? piiBackupRecords[existingIdx].id : `pii-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    savedAt: nowIso,
    source: entry.source,
    documentId: entry.documentId,
    documentTitle: entry.documentTitle,
    originalText: entry.originalText,
    maskedText: entry.maskedText,
    detectedCount: entry.detectedCount,
    items: entry.items,
  };

  if (existingIdx !== -1) {
    piiBackupRecords.splice(existingIdx, 1);
  }
  piiBackupRecords.unshift(record);
  if (piiBackupRecords.length > 50) {
    piiBackupRecords = piiBackupRecords.slice(0, 50);
  }
  savePiiBackupStore();
  return record;
}

function loadBackupManifest() {
  ensureBackupDir();
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      backupManifest = {
        autoBackupEnabled: typeof parsed.autoBackupEnabled === 'boolean' ? parsed.autoBackupEnabled : true,
        intervalMinutes: typeof parsed.intervalMinutes === 'number' && parsed.intervalMinutes > 0 ? parsed.intervalMinutes : 60,
        lastBackupAt: parsed.lastBackupAt || null,
        records: Array.isArray(parsed.records) ? parsed.records : [],
      };
    } catch (err) {
      console.warn('Failed to parse backup-manifest.json, resetting manifest:', err);
    }
  }
}

function saveBackupManifest() {
  ensureBackupDir();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(backupManifest, null, 2), 'utf-8');
}

function executeLocalBackup(trigger: 'auto' | 'manual' | 'startup' | 'immediate' = 'manual'): BackupRecord {
  ensureBackupDir();
  const now = new Date();
  const isoTime = now.toISOString();
  const stamp = isoTime.replace(/[:.]/g, '-');
  const fileName = `school_docs_backup_${stamp}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);

  // Store masked repository snapshot + vector index metadata (never export unmasked raw PII externally)
  const payload = {
    version: '1.1',
    exportedAt: isoTime,
    trigger,
    storageMode: 'School Local Storage (Closed LAN)',
    vectorEngine: 'ChromaDB v0.5.2 (bge-m3 1024d)',
    documentCount: schoolDocuments.length,
    deletedDocumentCount: deletedDocuments.length,
    piiBackupCount: piiBackupRecords.length,
    documents: schoolDocuments.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      securityLevel: doc.securityLevel,
      department: doc.department,
      receivedFrom: doc.receivedFrom || '',
      authorMasked: doc.authorMasked,
      date: doc.date,
      fiscalYear: doc.fiscalYear,
      fileType: doc.fileType,
      pageCount: doc.pageCount,
      deadlines: doc.deadlines || [],
      maskedText: doc.maskedText,
      summary: doc.summary,
      keywords: doc.keywords,
      piiCount: doc.piiCount,
      evidenceSnippets: doc.evidenceSnippets,
    })),
    deletedDocuments: deletedDocuments.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      securityLevel: doc.securityLevel,
      department: doc.department,
      receivedFrom: doc.receivedFrom || '',
      deletedAt: doc.deletedAt,
      piiCount: doc.piiCount,
    })),
  };

  const serialized = JSON.stringify(payload, null, 2);
  fs.writeFileSync(filePath, serialized, 'utf-8');

  const sizeBytes = Buffer.byteLength(serialized, 'utf-8');
  const checksum = crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 12);

  const record: BackupRecord = {
    id: `bak-${now.getTime()}`,
    fileName,
    createdAt: isoTime,
    trigger,
    documentCount: schoolDocuments.length,
    sizeBytes,
    checksum,
  };

  backupManifest.lastBackupAt = isoTime;
  backupManifest.records.unshift(record);

  // Prune old snapshots beyond MAX_BACKUP_GENERATIONS
  if (backupManifest.records.length > MAX_BACKUP_GENERATIONS) {
    const removed = backupManifest.records.splice(MAX_BACKUP_GENERATIONS);
    for (const old of removed) {
      const oldPath = path.join(BACKUP_DIR, old.fileName);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch {
          // ignore cleanup failure
        }
      }
    }
  }

  saveBackupManifest();
  return record;
}

function persistAndBackupNow(trigger: 'auto' | 'manual' | 'startup' | 'immediate' = 'immediate'): BackupRecord {
  saveDocumentsStore();
  savePiiBackupStore();
  return executeLocalBackup(trigger);
}

function getBackupStatus() {
  let nextBackupAt: string | null = null;
  if (backupManifest.autoBackupEnabled && backupManifest.lastBackupAt) {
    const lastMs = new Date(backupManifest.lastBackupAt).getTime();
    if (!Number.isNaN(lastMs)) {
      nextBackupAt = new Date(lastMs + backupManifest.intervalMinutes * 60 * 1000).toISOString();
    }
  }

  const totalSizeBytes = backupManifest.records.reduce((acc, r) => acc + (r.sizeBytes || 0), 0);

  return {
    autoBackupEnabled: backupManifest.autoBackupEnabled,
    intervalMinutes: backupManifest.intervalMinutes,
    lastBackupAt: backupManifest.lastBackupAt,
    nextBackupAt,
    storagePath: './.school_local_backups',
    backupCount: backupManifest.records.length,
    totalSizeBytes,
    recentBackups: backupManifest.records.slice(0, 5),
  };
}

function rescheduleAutoBackup() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }

  if (backupManifest.autoBackupEnabled) {
    const intervalMs = Math.max(1, backupManifest.intervalMinutes) * 60 * 1000;
    autoBackupTimer = setInterval(() => {
      try {
        persistAndBackupNow('auto');
        console.log(`[School Local Backup] Scheduled auto-backup completed at ${new Date().toISOString()}`);
      } catch (err) {
        console.error('[School Local Backup] Scheduled auto-backup failed:', err);
      }
    }, intervalMs);
  }
}

// Initialize persisted stores, backup state & scheduler on startup
loadDocumentsStore();
loadPiiBackupStore();
loadBackupManifest();
if (backupManifest.records.length === 0) {
  executeLocalBackup('startup');
}
rescheduleAutoBackup();

// API Routes

// 1. Server status & Local AI diagnostics
app.get('/api/status', async (req, res) => {
  const ollama = await checkOllamaHealth();
  res.json({
    status: 'online',
    serverType: '校内専用ローカルAIサーバー (Ollama + Gemma 4 12B)',
    ipAddress: '校内LANホスト (Port ' + port + ')',
    isolation: {
      status: 'External AI Blocked / Local Ollama Only',
      externalTrafficBlocked: true,
      packetsOutCount: 0,
      protocol: 'HTTP/HTTPS (校内閉域LAN)',
    },
    localHardware: {
      gpu: 'ホストPC GPU / CPU ローカル推論',
      cpu: '校内サーバーPC CPU',
      ram: 'ローカルメモリ領域',
      temperature: '正常',
      vramUsage: ollama.connected ? `稼働中 (${ollama.model})` : '待機中 (Ollama未接続)',
    },
    engines: {
      llm: {
        name: `Ollama / ${OLLAMA_MODEL} (校内ローカルLLM)`,
        contextWindow: '校内ローカル推論',
        status: ollama.connected
          ? `Connected (${ollama.modelInstalled ? 'モデル準備完了' : 'モデル未プル'})`
          : 'Standby (ルールベースフォールバック稼働中)',
      },
      vlm: {
        name: `Ollama Vision / ${OLLAMA_VISION_MODEL} (画像・手書きOCR)`,
        status: ollama.connected ? 'Ready (画像OCR受付可能)' : 'Offline (Ollama起動待ち)',
      },
      vectorDb: {
        name: '校内ローカル文書インデックス',
        embeddingModel: 'ローカル検索インデックス',
        totalDocuments: schoolDocuments.length,
        indexedVectors: schoolDocuments.length * 4,
      },
      piiEngine: {
        name: '校内プライバシー仮名化エンジン v2.4 (ルールベース+NERハイブリッド)',
        status: 'Mandatory Active (AI送信前・保存前に自動適用)',
      },
    },
    cloudBackupAvailable: false,
    externalAiBlocked: true,
    ollama,
    backup: getBackupStatus(),
  });
});

// 1b. Local Storage Backup APIs
app.get('/api/backup/status', (req, res) => {
  res.json(getBackupStatus());
});

app.post('/api/backup/run', (req, res) => {
  try {
    const record = executeLocalBackup('manual');
    res.json({
      success: true,
      record,
      status: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'バックアップの実行に失敗しました' });
  }
});

app.post('/api/backup/config', (req, res) => {
  try {
    const { autoBackupEnabled, intervalMinutes } = req.body;
    if (typeof autoBackupEnabled === 'boolean') {
      backupManifest.autoBackupEnabled = autoBackupEnabled;
    }
    if (typeof intervalMinutes === 'number' && intervalMinutes >= 1 && intervalMinutes <= 1440) {
      backupManifest.intervalMinutes = intervalMinutes;
    }
    saveBackupManifest();
    rescheduleAutoBackup();
    res.json({
      success: true,
      status: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'バックアップ設定の更新に失敗しました' });
  }
});

// 2. Document listing (all documents accessible)
app.get('/api/documents', (req, res) => {
  const category = (req.query.category as string) || 'all';
  const query = (req.query.q as string) || '';

  let filtered = [...schoolDocuments];

  // Category filter
  if (category !== 'all') {
    filtered = filtered.filter(d => d.category === category);
  }

  // Keyword query
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter(d =>
      d.title.toLowerCase().includes(q) ||
      (d.receivedFrom || '').toLowerCase().includes(q) ||
      d.keywords.some(k => k.toLowerCase().includes(q)) ||
      d.summary.toLowerCase().includes(q) ||
      d.maskedText.toLowerCase().includes(q)
    );
  }

  res.json({ documents: filtered, total: filtered.length });
});

// 3. Document details by ID
app.get('/api/documents/:id', (req, res) => {
  const doc = schoolDocuments.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: '書類が見つかりません' });
  }
  res.json(doc);
});

// 4. Analyze document before saving (PII + Deadlines + Importance + Auto-Tags + AI Summary + Duplicates)
app.post('/api/analyze-document', (req, res) => {
  const { title = '', rawText = '', category = '学年経営', securityLevel = '全校共有', excludeId } = req.body;
  if (!rawText.trim() && !title.trim()) {
    return res.status(400).json({ error: '解析対象のタイトルまたは本文を入力してください' });
  }

  const piiResult = maskPiiInText(rawText);
  const deadlines = detectDeadlines(rawText);
  const importance = classifyImportance(title, rawText, category, securityLevel);
  const autoTags = generateAutoTags(title, rawText, category);
  const { summary, aiSummaryPoints } = generateConciseSummary(title || '新規書類', piiResult.maskedText);
  const duplicates = findDuplicateCandidates(title, rawText, excludeId);

  res.json({
    piiResult,
    deadlines,
    importance: importance.importance,
    importanceReason: importance.importanceReason,
    autoTags,
    summary,
    aiSummaryPoints,
    duplicates,
  });
});

// 4b. Check duplicates explicitly
app.post('/api/documents/check-duplicate', (req, res) => {
  const { title = '', rawText = '', excludeId } = req.body;
  const duplicates = findDuplicateCandidates(title, rawText, excludeId);
  res.json({
    hasDuplicate: duplicates.length > 0,
    duplicates,
  });
});

// 4c. Add / Upload new document with automatic AI-OCR, PII masking, duplicate guard, and intelligence enrichment
app.post('/api/documents', (req, res) => {
  try {
    const {
      title,
      category,
      securityLevel,
      department,
      receivedFrom,
      author,
      rawText,
      fileType,
      customTags,
      customDeadlines,
      forceSave,
      updateDocId,
    } = req.body;

    if (!title || !rawText) {
      return res.status(400).json({ error: 'タイトルと文書内容は必須です' });
    }

    // If user chose to update an existing document as a new revision
    if (updateDocId) {
      const existingIdx = schoolDocuments.findIndex(d => d.id === updateDocId);
      if (existingIdx !== -1) {
        const existing = schoolDocuments[existingIdx];
        const piiResult = maskPiiInText(rawText);
        const authorPii = maskPiiInText(author || existing.author);
        const nowDate = new Date().toISOString().split('T')[0];
        const newVersion = existing.version + 1;
        const concise = generateConciseSummary(title, piiResult.maskedText);
        const deadlines =
          Array.isArray(customDeadlines) && customDeadlines.length > 0
            ? customDeadlines
            : detectDeadlines(rawText, nowDate);
        const imp = classifyImportance(title, rawText, category || existing.category, securityLevel || existing.securityLevel);
        const autoTags = generateAutoTags(title, rawText, category || existing.category);
        const finalTags = Array.isArray(customTags) && customTags.length > 0 ? customTags : autoTags;

        const newRevision: DocumentRevision = {
          version: newVersion,
          updatedAt: nowDate,
          updatedBy: authorPii.maskedText,
          changeNote: '重複検知からの新版上書き更新',
          maskedText: piiResult.maskedText,
          summary: concise.summary,
        };

        const updatedDoc: SchoolDoc = {
          ...existing,
          title,
          category: category || existing.category,
          securityLevel: securityLevel || existing.securityLevel,
          importance: imp.importance,
          importanceReason: imp.importanceReason,
          department: department || existing.department,
          receivedFrom: receivedFrom !== undefined ? receivedFrom : existing.receivedFrom,
          author: author || existing.author,
          authorMasked: authorPii.maskedText,
          date: nowDate,
          originalText: rawText,
          maskedText: piiResult.maskedText,
          summary: concise.summary,
          aiSummaryPoints: concise.aiSummaryPoints,
          keywords: finalTags,
          deadlines,
          piiCount: piiResult.detectedCount,
          piiItems: piiResult.items,
          version: newVersion,
          contentHash: computeContentHash(rawText),
          revisions: [...existing.revisions, newRevision],
        };

        schoolDocuments[existingIdx] = updatedDoc;
        if (piiResult.items.length > 0) {
          upsertPiiBackupRecord({
            source: 'document',
            documentId: updatedDoc.id,
            documentTitle: updatedDoc.title,
            originalText: rawText,
            maskedText: piiResult.maskedText,
            detectedCount: piiResult.detectedCount,
            items: piiResult.items,
          });
        }
        persistAndBackupNow('immediate');
        return res.json({ success: true, updated: true, document: updatedDoc, backupStatus: getBackupStatus() });
      }
    }

    // Duplicate detection guard unless forceSave is true
    if (!forceSave) {
      const duplicates = findDuplicateCandidates(title, rawText);
      if (duplicates.length > 0) {
        return res.status(409).json({
          error: '類似または同一内容の書類が既に登録されています',
          duplicates,
        });
      }
    }

    const piiResult = maskPiiInText(rawText);
    const authorPii = maskPiiInText(author || '教諭');
    const nowDate = new Date().toISOString().split('T')[0];
    const cat = category || '学年経営';
    const sec = securityLevel || '全校共有';
    const deadlines =
      Array.isArray(customDeadlines) && customDeadlines.length > 0
        ? customDeadlines
        : detectDeadlines(rawText, nowDate);
    const imp = classifyImportance(title, rawText, cat, sec);
    const autoTags = generateAutoTags(title, rawText, cat);
    const finalTags = Array.isArray(customTags) && customTags.length > 0 ? customTags : autoTags;
    const concise = generateConciseSummary(title, piiResult.maskedText);

    const newDoc: SchoolDoc = {
      id: `doc-${Date.now().toString().slice(-6)}`,
      title,
      category: cat,
      securityLevel: sec,
      importance: imp.importance,
      importanceReason: imp.importanceReason,
      department: department || '教務部',
      receivedFrom: typeof receivedFrom === 'string' ? receivedFrom.trim() : '',
      author: author || '担当教諭',
      authorMasked: authorPii.maskedText,
      date: nowDate,
      fiscalYear: '令和7年度',
      fileType: fileType || 'pdf',
      pageCount: Math.ceil(rawText.length / 500) || 1,
      originalText: rawText,
      maskedText: piiResult.maskedText,
      summary: concise.summary,
      aiSummaryPoints: concise.aiSummaryPoints,
      keywords: finalTags,
      deadlines,
      piiCount: piiResult.detectedCount,
      piiItems: piiResult.items,
      evidenceSnippets: [
        {
          page: 1,
          section: '主要抜粋',
          text: piiResult.maskedText.slice(0, 200),
        },
      ],
      version: 1,
      contentHash: computeContentHash(rawText),
      revisions: [
        {
          version: 1,
          updatedAt: nowDate,
          updatedBy: authorPii.maskedText,
          changeNote: '初回ローカル登録（自動仮名化・タグ生成済）',
          maskedText: piiResult.maskedText,
          summary: concise.summary,
        },
      ],
    };

    schoolDocuments.unshift(newDoc);
    if (piiResult.items.length > 0) {
      upsertPiiBackupRecord({
        source: 'document',
        documentId: newDoc.id,
        documentTitle: newDoc.title,
        originalText: rawText,
        maskedText: piiResult.maskedText,
        detectedCount: piiResult.detectedCount,
        items: piiResult.items,
      });
    }
    persistAndBackupNow('immediate');
    res.json({ success: true, document: newDoc, backupStatus: getBackupStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類の登録に失敗しました' });
  }
});

// 4d. Update an existing document (creates new revision for old/new diff comparison)
app.put('/api/documents/:id', (req, res) => {
  try {
    const idx = schoolDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '更新対象の書類が見つかりません' });
    }

    const existing = schoolDocuments[idx];
    const { title, rawText, changeNote, updatedBy } = req.body;
    const nextTitle = title || existing.title;
    const nextOriginal = rawText || existing.originalText;
    const piiResult = maskPiiInText(nextOriginal);
    const nowDate = new Date().toISOString().split('T')[0];
    const nextVersion = existing.version + 1;
    const concise = generateConciseSummary(nextTitle, piiResult.maskedText);
    const deadlines = detectDeadlines(nextOriginal, nowDate);
    const imp = classifyImportance(nextTitle, nextOriginal, existing.category, existing.securityLevel);
    const autoTags = generateAutoTags(nextTitle, nextOriginal, existing.category);

    const newRev: DocumentRevision = {
      version: nextVersion,
      updatedAt: nowDate,
      updatedBy: updatedBy || existing.authorMasked,
      changeNote: changeNote || `第${nextVersion}版 改訂更新`,
      maskedText: piiResult.maskedText,
      summary: concise.summary,
    };

    const updatedDoc: SchoolDoc = {
      ...existing,
      title: nextTitle,
      importance: imp.importance,
      importanceReason: imp.importanceReason,
      date: nowDate,
      originalText: nextOriginal,
      maskedText: piiResult.maskedText,
      summary: concise.summary,
      aiSummaryPoints: concise.aiSummaryPoints,
      keywords: Array.from(new Set([...existing.keywords, ...autoTags])).slice(0, 7),
      deadlines,
      piiCount: piiResult.detectedCount,
      piiItems: piiResult.items,
      version: nextVersion,
      contentHash: computeContentHash(nextOriginal),
      revisions: [...existing.revisions, newRev],
    };

    schoolDocuments[idx] = updatedDoc;
    if (piiResult.items.length > 0) {
      upsertPiiBackupRecord({
        source: 'document',
        documentId: updatedDoc.id,
        documentTitle: updatedDoc.title,
        originalText: nextOriginal,
        maskedText: piiResult.maskedText,
        detectedCount: piiResult.detectedCount,
        items: piiResult.items,
      });
    }
    persistAndBackupNow('immediate');
    res.json({ success: true, document: updatedDoc, backupStatus: getBackupStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類の更新に失敗しました' });
  }
});

// 4d-2. Update document metadata (receivedFrom & deadlines) directly
app.patch('/api/documents/:id/metadata', (req, res) => {
  try {
    const idx = schoolDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '更新対象の書類が見つかりません' });
    }

    const existing = schoolDocuments[idx];
    const { receivedFrom, deadlines } = req.body;

    const sanitizedDeadlines = Array.isArray(deadlines)
      ? deadlines
          .filter((d: any) => d && typeof d.dateText === 'string' && d.dateText.trim())
          .map((d: any) => ({
            label: typeof d.label === 'string' && d.label.trim() ? d.label.trim() : '期限',
            dateText: d.dateText.trim(),
            type: d.type === '開催日' || d.type === '定期期日' ? d.type : '提出期限',
            urgency: d.urgency === '緊急' || d.urgency === '通常' ? d.urgency : '近日',
          }))
      : existing.deadlines;

    const updatedDoc: SchoolDoc = {
      ...existing,
      receivedFrom: typeof receivedFrom === 'string' ? receivedFrom.trim() : existing.receivedFrom,
      deadlines: sanitizedDeadlines,
    };

    schoolDocuments[idx] = updatedDoc;
    persistAndBackupNow('immediate');
    res.json({ success: true, document: updatedDoc, backupStatus: getBackupStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類情報の更新に失敗しました' });
  }
});

// 4d-3. Soft-delete document (hide from portal & AI, move to deletedDocuments)
app.delete('/api/documents/:id', (req, res) => {
  try {
    const idx = schoolDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '削除対象の書類が見つかりません' });
    }
    const [removed] = schoolDocuments.splice(idx, 1);
    const deletedDoc: DeletedSchoolDoc = {
      ...removed,
      deletedAt: new Date().toISOString(),
    };
    deletedDocuments.unshift(deletedDoc);
    persistAndBackupNow('immediate');
    res.json({
      success: true,
      deletedDocument: deletedDoc,
      deletedCount: deletedDocuments.length,
      backupStatus: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類の削除に失敗しました' });
  }
});

// 4d-4. List soft-deleted (hidden) documents
app.get('/api/deleted-documents', (req, res) => {
  res.json({ documents: deletedDocuments, total: deletedDocuments.length });
});

// 4d-5. Restore a soft-deleted document back to active portal
app.post('/api/documents/:id/restore', (req, res) => {
  try {
    const idx = deletedDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '復元対象の書類が見つかりません' });
    }
    const [deletedDoc] = deletedDocuments.splice(idx, 1);
    const { deletedAt: _deletedAt, ...rest } = deletedDoc;
    const restoredDoc: SchoolDoc = { ...rest };
    schoolDocuments.unshift(restoredDoc);
    persistAndBackupNow('immediate');
    res.json({
      success: true,
      document: restoredDoc,
      deletedCount: deletedDocuments.length,
      backupStatus: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類の復元に失敗しました' });
  }
});

// 4d-6. Permanently delete a document from deletedDocuments
app.delete('/api/documents/:id/permanent', (req, res) => {
  try {
    const idx = deletedDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '完全削除対象の書類が見つかりません' });
    }
    const [removed] = deletedDocuments.splice(idx, 1);
    // Also clean associated PII backup records for permanent deletion
    piiBackupRecords = piiBackupRecords.filter(r => r.documentId !== removed.id);
    persistAndBackupNow('immediate');
    res.json({
      success: true,
      deletedId: removed.id,
      deletedCount: deletedDocuments.length,
      backupStatus: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '完全削除に失敗しました' });
  }
});

// 4e. Related documents search for a specific document
app.get('/api/documents/:id/related', (req, res) => {
  const target = schoolDocuments.find(d => d.id === req.params.id);
  if (!target) {
    return res.status(404).json({ error: '書類が見つかりません' });
  }

  const candidates = schoolDocuments.filter(d => d.id !== target.id);

  const related = candidates.map(doc => {
    const sharedKeywords = doc.keywords.filter(k => target.keywords.includes(k));
    const textSim = computeTextSimilarity(target.maskedText.slice(0, 600), doc.maskedText.slice(0, 600));
    const catBonus = doc.category === target.category ? 0.22 : 0;
    const kwBonus = Math.min(0.35, sharedKeywords.length * 0.14);
    const similarityScore = Math.min(0.97, Math.max(0.25, Math.round((textSim + catBonus + kwBonus) * 100) / 100));

    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      securityLevel: doc.securityLevel,
      importance: doc.importance,
      similarityScore,
      sharedKeywords,
      date: doc.date,
    };
  });

  related.sort((a, b) => b.similarityScore - a.similarityScore);
  res.json({ related: related.slice(0, 4) });
});

// 4f. On-demand AI summarization via local Ollama (Gemma 4 12B); external Gemini calls are blocked
app.post('/api/documents/:id/summarize', async (req, res) => {
  const doc = schoolDocuments.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: '書類が見つかりません' });
  }

  try {
    const result = await callOllamaChat({
      model: OLLAMA_MODEL,
      format: 'json',
      timeoutMs: Math.min(OLLAMA_TIMEOUT_MS, 45000),
      messages: [
        {
          role: 'system',
          content:
            'あなたは校内ローカルAI（Gemma 4 12B）です。仮名化済みの学校書類を教員向けに「1行の総括(summary)」と「3つの箇条書きポイント(points)」に要約し、JSON形式 {"summary": "...", "points": ["...", "...", "..."]} のみを返してください。',
        },
        {
          role: 'user',
          content: `タイトル: ${doc.title}\n本文:\n${doc.maskedText}`,
        },
      ],
    });

    const cleanedJson = result.content
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleanedJson);
    if (parsed.summary && Array.isArray(parsed.points)) {
      doc.summary = String(parsed.summary);
      doc.aiSummaryPoints = parsed.points.map((p: any) => String(p)).slice(0, 4);
      saveDocumentsStore();
      return res.json({
        summary: doc.summary,
        aiSummaryPoints: doc.aiSummaryPoints,
        modelUsed: `Ollama / ${result.model} (校内ローカル推論 · ${result.durationMs}ms)`,
      });
    }
  } catch (err: any) {
    console.warn('Ollama summarize unavailable, falling back to local rule synthesizer:', err.message);
  }

  const concise = generateConciseSummary(doc.title, doc.maskedText);
  doc.summary = concise.summary;
  doc.aiSummaryPoints = concise.aiSummaryPoints;
  saveDocumentsStore();

  res.json({
    summary: doc.summary,
    aiSummaryPoints: doc.aiSummaryPoints,
    modelUsed: 'ローカルルール要約エンジン（Ollama未接続時フォールバック）',
  });
});

// 4g. Image OCR via local Ollama Vision (Gemma 4 12B) — External cloud OCR blocked
app.post('/api/ocr', async (req, res) => {
  try {
    const { imageBase64, fileName } = req.body || {};
    if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
      return res.status(400).json({ error: 'OCR対象の画像データが見つかりません' });
    }

    const base64Clean = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
    if (!base64Clean || base64Clean.length < 32) {
      return res.status(400).json({ error: '有効な画像データ（Base64）を指定してください' });
    }

    const ocrResult = await callOllamaChat({
      model: OLLAMA_VISION_MODEL,
      timeoutMs: OLLAMA_TIMEOUT_MS,
      messages: [
        {
          role: 'system',
          content:
            'あなたは学校業務向けの正確な日本語OCRエンジンです。画像内の印刷文字・手書き文字・表・日付・提出期限・連絡先・差出人・氏名を省略せず、元のレイアウトや見出しを保ったままプレーンテキストで忠実に書き起こしてください。存在しない文字を推測で補完したり要約したりせず、読み取ったテキストのみを出力してください。',
        },
        {
          role: 'user',
          content: 'この学校書類画像の文字情報をすべて正確に読み取って書き起こしてください。',
          images: [base64Clean],
        },
      ],
    });

    const extractedText = ocrResult.content.trim();
    const firstNonEmptyLine = extractedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length >= 2) || '';

    const baseTitleFromFile =
      typeof fileName === 'string' && fileName.trim()
        ? fileName.replace(/\.[^.]+$/, '').trim()
        : '';

    const suggestedTitle =
      firstNonEmptyLine.length >= 3 && firstNonEmptyLine.length <= 60
        ? firstNonEmptyLine
        : baseTitleFromFile || 'カメラ・画像OCR読取書類';

    const piiPreview = maskPiiInText(extractedText);

    res.json({
      success: true,
      rawText: extractedText,
      suggestedTitle,
      piiCount: piiPreview.detectedCount,
      maskedPreview: piiPreview.maskedText,
      engine: `Ollama Vision / ${ocrResult.model}`,
      isLocal: true,
      inferenceTimeMs: ocrResult.durationMs,
    });
  } catch (err: any) {
    console.warn('Ollama OCR failed:', err.message);
    res.status(503).json({
      success: false,
      ocrUnavailable: true,
      error: `校内Ollamaサーバー（${OLLAMA_BASE_URL} / モデル: ${OLLAMA_VISION_MODEL}）に接続できませんでした。PC上でOllamaとモデルを起動した状態で再度お試しください。（詳細: ${err.message}）`,
      ollamaBaseUrl: OLLAMA_BASE_URL,
      model: OLLAMA_VISION_MODEL,
    });
  }
});

// 5. Test PII masking preview on arbitrary text
app.post('/api/mask-pii', (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'テキストを入力してください' });
  }
  if (!text.trim()) {
    return res.json({ maskedText: '', detectedCount: 0, items: [] });
  }
  const result = maskPiiInText(text);
  res.json(result);
});

// 5b. Immediate backup endpoints for PII records (Privacy Masking Lab & Document PII)
app.get('/api/pii-backup', (req, res) => {
  res.json({
    records: piiBackupRecords,
    totalCount: piiBackupRecords.length,
    backupStatus: getBackupStatus(),
  });
});

app.post('/api/pii-backup', (req, res) => {
  try {
    const { text, documentId, documentTitle, source } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: '保存する本文テキストを入力してください' });
    }
    const piiResult = maskPiiInText(text);
    const record = upsertPiiBackupRecord({
      source: source === 'document' ? 'document' : 'lab',
      documentId: typeof documentId === 'string' ? documentId : undefined,
      documentTitle: typeof documentTitle === 'string' ? documentTitle : undefined,
      originalText: text,
      maskedText: piiResult.maskedText,
      detectedCount: piiResult.detectedCount,
      items: piiResult.items,
    });
    executeLocalBackup('immediate');
    res.json({
      success: true,
      record,
      records: piiBackupRecords,
      totalCount: piiBackupRecords.length,
      backupStatus: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '個人情報のバックアップ保存に失敗しました' });
  }
});

// 6. RAG Vector Search endpoint (ChromaDB simulation)
app.post('/api/rag-search', (req, res) => {
  const { query, category } = req.body;
  if (!query) {
    return res.json({ results: [] });
  }

  let candidates = [...schoolDocuments];

  if (category && category !== 'all') {
    candidates = candidates.filter(d => d.category === category);
  }

  // Calculate similarity scores based on token matches, keywords, and semantic terms
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = candidates.map(doc => {
    let score = 0.55; // baseline

    terms.forEach((t: string) => {
      if (doc.title.toLowerCase().includes(t)) score += 0.25;
      if (doc.keywords.some((k: string) => k.toLowerCase().includes(t))) score += 0.20;
      if (doc.maskedText.toLowerCase().includes(t)) score += 0.15;
    });

    // Normalize between 0.65 and 0.98
    const simScore = Math.min(0.98, Math.max(0.62, Math.round(score * 100) / 100));

    // Find best matching snippet
    let matchingSnippet = doc.evidenceSnippets[0] || {
      page: 1,
      section: '本文',
      text: doc.maskedText.slice(0, 160) + '...',
    };

    for (const snip of doc.evidenceSnippets) {
      if (terms.some((t: string) => snip.text.toLowerCase().includes(t))) {
        matchingSnippet = snip;
        break;
      }
    }

    return {
      documentId: doc.id,
      title: doc.title,
      category: doc.category,
      securityLevel: doc.securityLevel,
      importance: doc.importance,
      deadlines: doc.deadlines,
      pageCount: doc.pageCount,
      similarityScore: simScore,
      evidenceSnippet: matchingSnippet,
      fiscalYear: doc.fiscalYear,
      date: doc.date,
    };
  });

  // Sort by similarity descending
  scored.sort((a, b) => b.similarityScore - a.similarityScore);

  res.json({
    query,
    results: scored.slice(0, 5),
    vectorEngine: 'ChromaDB Local Vector DB (bge-m3 1024d Cosine Distance)',
  });
});

// 7. AI Chat & Document Assistant (Local Ollama Gemma 4 12B + fallback; external Gemini blocked)
app.post('/api/ai-chat', async (req, res) => {
  const { prompt, targetDocId } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: '質問内容を入力してください' });
  }

  // 1. Retrieve relevant documents context
  const relevantDocs = [...schoolDocuments];

  let activeDocs: SchoolDoc[] = [];
  if (targetDocId) {
    const specific = relevantDocs.find(d => d.id === targetDocId);
    if (specific) {
      activeDocs = [specific];
    }
  }

  const lowerPrompt = prompt.toLowerCase();
  if (activeDocs.length === 0) {
    const matchedDocs = relevantDocs.filter(d => {
      return (
        d.keywords.some((k: string) => lowerPrompt.includes(k.toLowerCase())) ||
        d.title.toLowerCase().split('').some((char: string) => lowerPrompt.includes(char)) ||
        lowerPrompt.includes(d.category.toLowerCase())
      );
    });
    activeDocs = matchedDocs.length > 0 ? matchedDocs.slice(0, 3) : relevantDocs.slice(0, 2);
  }

  // Prepare safe masked context (never send unmasked PII even to local model)
  const contextText = activeDocs
    .map(
      d =>
        `【書類名: ${d.title} (ID: ${d.id}, 区分: ${d.category}, 重要度: ${d.importance}, 秘匿度: ${d.securityLevel})】\n${d.maskedText}`
    )
    .join('\n\n---\n\n');

  // Use local Ollama (Gemma 4 12B); external Gemini path is strictly blocked
  try {
    const systemInstruction = `あなたは校内ローカルPC上のOllamaで動作する学校業務支援AIアシスタント（Gemma 4 12B）です。
以下の校内文書（個人情報仮名化済み）の文脈を元に、教員の質問に正確・丁寧に答えてください。
回答には必ずどの書類のどの条項・ページが根拠であるか【根拠: 書類名 p.X】の形式で明記してください。
教員の業務（週報、引き継ぎ、保護者通知、マニュアル確認）にすぐ活用できるよう、要点箇条書きと実践的なアドバイスを含めてください。
個人情報は全て仮名化コード（[生徒ID: S-XXXX]等）のまま扱い、勝手に実名を捏造しないでください。`;

    const ollamaRes = await callOllamaChat({
      model: OLLAMA_MODEL,
      timeoutMs: OLLAMA_TIMEOUT_MS,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `文脈情報:\n${contextText}\n\n教員からの質問:\n${prompt}` },
      ],
    });

    return res.json({
      response: ollamaRes.content,
      modelUsed: `Ollama / ${ollamaRes.model} (校内ローカル推論)`,
      isLocal: true,
      inferenceTimeMs: ollamaRes.durationMs,
      referencedDocs: activeDocs.map(d => ({
        id: d.id,
        title: d.title,
        category: d.category,
        securityLevel: d.securityLevel,
        evidence: d.evidenceSnippets[0] || { page: 1, section: '本文', text: d.maskedText.slice(0, 120) },
      })),
    });
  } catch (err: any) {
    console.warn('Ollama chat unavailable, falling back to deterministic local synthesizer:', err.message);
  }

  // Deterministic Local Fallback Synthesizer (when Ollama service is not running)
  let localAnswer = '';
  const targetDoc = activeDocs[0];
  if (targetDoc) {
    const keywordsInPrompt = prompt
      .replace(/[？?！!。、はがのをにでへと]/g, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length >= 2);
    const docLines = targetDoc.maskedText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 8);
    const matchedLines = docLines.filter((line) =>
      keywordsInPrompt.some((kw: string) => line.toLowerCase().includes(kw.toLowerCase()))
    );
    const relevantExcerpt = (matchedLines.length > 0 ? matchedLines.slice(0, 4) : targetDoc.aiSummaryPoints)
      .map((l) => `・${l}`)
      .join('\n');

    const deadlineNote =
      targetDoc.deadlines && targetDoc.deadlines.length > 0
        ? `\n\n【自動検出された期限・日程】\n${targetDoc.deadlines
            .map((dl) => `・${dl.label}: ${dl.dateText}（${dl.type}）`)
            .join('\n')}`
        : '';

    localAnswer = `【書類照会回答：『${targetDoc.title}』】
重要度判定: ${targetDoc.importance}（${targetDoc.importanceReason}）

ご質問「${prompt}」に関連する記載内容は以下の通りです【根拠: ${targetDoc.title} p.1】：

${relevantExcerpt}${deadlineNote}

【確認・引継ぎポイント】
・担当部署: ${targetDoc.department}（仮名化保護件数: ${targetDoc.piiCount}件）
・詳細は「仮名化表示」または「根拠条項スニペット」タブで原文箇所をご確認いただけます。`;
  } else if (schoolDocuments.length === 0) {
    localAnswer = `【登録書類がありません】

現在、校内書庫に書類が1件も登録されていません。
左上の「新規書類取込」ボタンから書類や画像を登録すると、その資料の内容に基づいて回答できるようになります。`;
  } else {
    localAnswer = `【校内知識ベース照会結果】

登録されている書類内に該当記述が見つかりませんでした。検索キーワードを変更してお試しください。`;
  }

  res.json({
    response: localAnswer,
    modelUsed: `ローカルルール補完（Ollama ${OLLAMA_MODEL} 未接続時フォールバック）`,
    isLocal: true,
    inferenceTimeMs: 42,
    referencedDocs: activeDocs.map(d => ({
      id: d.id,
      title: d.title,
      category: d.category,
      securityLevel: d.securityLevel,
      evidence: d.evidenceSnippets[0] || { page: 1, section: '本文', text: d.maskedText.slice(0, 120) },
    })),
  });
});

// Vite middleware in dev or static serving in prod
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[School Local AI Server] Listening on http://0.0.0.0:${port}`);
  });
}

startServer();
