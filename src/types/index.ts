export type CategoryType = 
  | '学年経営'
  | '行事マニュアル'
  | 'PTA資料'
  | '生徒指導'
  | '事務・予算'
  | '保健・安全'
  | '定期考査・成績';

export type SecurityLevel = '全校共有' | '学年・部局限定' | '機密';

export type ImportanceLevel = '緊急・重要' | '重要' | '通常';

export interface PIIItem {
  type: string;
  original: string;
  masked: string;
}

export interface EvidenceSnippet {
  page: number;
  section: string;
  text: string;
}

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

export interface DuplicateCandidate {
  id: string;
  title: string;
  similarityScore: number;
  matchType: '完全一致' | '内容類似' | 'タイトル類似';
  version: number;
  date: string;
}

export interface RelatedDocumentItem {
  id: string;
  title: string;
  category: CategoryType;
  securityLevel: SecurityLevel;
  importance: ImportanceLevel;
  similarityScore: number;
  sharedKeywords: string[];
  date: string;
}

export interface SchoolDoc {
  id: string;
  title: string;
  category: CategoryType;
  securityLevel: SecurityLevel;
  importance: ImportanceLevel;
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
  piiItems: PIIItem[];
  evidenceSnippets: EvidenceSnippet[];
  version: number;
  contentHash: string;
  revisions: DocumentRevision[];
}

export interface DeletedSchoolDoc extends SchoolDoc {
  deletedAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  modelUsed?: string;
  isLocal?: boolean;
  inferenceTimeMs?: number;
  referencedDocs?: {
    id: string;
    title: string;
    category: string;
    securityLevel: string;
    evidence: EvidenceSnippet;
  }[];
}

export interface SearchResult {
  documentId: string;
  title: string;
  category: CategoryType;
  securityLevel: SecurityLevel;
  importance: ImportanceLevel;
  deadlines: DeadlineItem[];
  pageCount: number;
  similarityScore: number;
  evidenceSnippet: EvidenceSnippet;
  fiscalYear: string;
  date: string;
}

export interface BackupRecord {
  id: string;
  fileName: string;
  createdAt: string;
  trigger: 'auto' | 'manual' | 'startup' | 'immediate';
  documentCount: number;
  sizeBytes: number;
  checksum: string;
}

export interface BackupStatusInfo {
  autoBackupEnabled: boolean;
  intervalMinutes: number;
  lastBackupAt: string | null;
  nextBackupAt: string | null;
  storagePath: string;
  backupCount: number;
  totalSizeBytes: number;
  recentBackups: BackupRecord[];
}

export interface ServerStatusInfo {
  status: string;
  serverType: string;
  ipAddress: string;
  isolation: {
    status: string;
    externalTrafficBlocked: boolean;
    packetsOutCount: number;
    protocol: string;
  };
  localHardware: {
    gpu: string;
    cpu: string;
    ram: string;
    temperature: string;
    vramUsage: string;
  };
  engines: {
    llm: {
      name: string;
      contextWindow: string;
      status: string;
    };
    vlm: {
      name: string;
      status: string;
    };
    vectorDb: {
      name: string;
      embeddingModel: string;
      totalDocuments: number;
      indexedVectors: number;
    };
    piiEngine: {
      name: string;
      status: string;
    };
  };
  cloudBackupAvailable: boolean;
  externalAiBlocked?: boolean;
  ollama?: {
    baseUrl: string;
    model: string;
    visionModel: string;
    connected: boolean;
    modelInstalled: boolean;
    availableModels: string[];
    activeQueueLength: number;
    error?: string;
  };
  backup?: BackupStatusInfo;
}
