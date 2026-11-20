import type { LJSpeechSegmentPreview, LossHistoryPoint } from "@/db/schema";

export interface SpeakerItem {
  id: number;
  speakerCode: string;
  displayName: string;
  roleTitle: string;
  gender: string;
  mode: string; // "finetuned" | "zero_shot"
  basePitchHz: number;
  refDurationSec: number;
  refSampleRate: number;
  refAudioFile: string;
  refAudioUrl: string;
  latentCached: boolean;
  similarityScore: number;
  voicePersona?: string;
  styleVectorDim?: number;
  checkpointName: string;
  generatedCount: number;
  refEngine?: string;
  refVoice?: string;
  refEnVoice?: string;
  refVoiceMode?: string;
  refUnified?: boolean;
  unifiedVoicePlan?: string;
  createdAt: string;
}

export interface AudioTrackItem {
  id: number;
  articleId: number;
  speakerId: number;
  speakerCode: string;
  speakerName: string;
  speakerRole: string;
  speakerMode: string;
  status: string;
  speed: number;
  alpha?: number;
  beta?: number;
  diffusionSteps?: number;
  embeddingScale?: number;
  temperature: number;
  repetitionPenalty: number;
  audioFilename: string;
  audioUrl: string;
  durationSec: number;
  sampleRate: number;
  fileSizeBytes: number;
  chunkCount: number;
  rtf: number;
  lufs: number;
  waveformPeaks: number[];
  engine?: string;
  voice?: string;
  enVoice?: string;
  persona?: string;
  voiceMode?: string;
  unifiedVoice?: string | null;
  unified?: boolean;
  voiceConsistency?: number;
  bilingual?: boolean;
  enSpans?: number;
  createdAt: string;
}

export interface ArticleItem {
  id: number;
  slug: string;
  title: string;
  publisherName: string;
  category: string;
  rawText: string;
  normalizedText: string;
  chunksJson: string[];
  status: string;
  tracks: AudioTrackItem[];
  createdAt: string;
  updatedAt: string;
}

export interface FineTuneRunItem {
  id: number;
  runName: string;
  speakerName: string;
  speakerDisplayName: string;
  datasetName: string;
  datasetDurationMin: number;
  trainSegments: number;
  evalSegments: number;
  rejectedSegments: number;
  sampleManifest: LJSpeechSegmentPreview[];
  engineType?: string;
  epochs: number;
  batchSize: number;
  gradAccumSteps: number;
  learningRate: string;
  alpha?: number;
  beta?: number;
  diffusionSteps?: number;
  slmAdversarial?: boolean;
  status: string;
  isActive: boolean;
  initialMelLoss: number;
  finalMelLoss: number;
  lossHistory: LossHistoryPoint[];
  checkpointPath: string;
  createdAt: string;
}

export interface PublisherClientItem {
  id: number;
  name: string;
  domain: string;
  apiKeyPrefix: string;
  apiKeyHash: string;
  gpuSpec: string;
  bundleVersion: string;
  accentColor: string;
  status: string;
  createdAt: string;
}

export interface StudioStats {
  totalArticles: number;
  totalAudioTracks: number;
  totalAudioSec: number;
  totalSpeakers: number;
  finetunedModels: number;
  engineName?: string;
  avgRtf: number;
  activeCheckpoint: string;
  humanTracks?: number;
  bilingualTracks?: number;
  unifiedTracks?: number;
  sampleRateHz: number;
  offlineMode: boolean;
}

export interface StudioState {
  stats: StudioStats;
  speakers: SpeakerItem[];
  articles: ArticleItem[];
  finetuneRuns: FineTuneRunItem[];
  publisherClients: PublisherClientItem[];
}

export interface SdkFileItem {
  id: string;
  relativePath: string;
  diskPath: string;
  category: string;
  title: string;
  description: string;
  language: string;
  lines: number;
  sizeBytes: number;
  content: string;
}
