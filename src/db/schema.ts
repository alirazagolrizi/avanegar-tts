import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export interface LJSpeechSegmentPreview {
  audioFile: string;
  text: string;
  speakerName: string;
  durationSec: number;
}

export interface LossHistoryPoint {
  epoch: number;
  melLoss: number;
  textLoss: number;
}

export const speakers = pgTable("speakers", {
  id: serial("id").primaryKey(),
  speakerCode: text("speaker_code").notNull().unique(),
  displayName: text("display_name").notNull(),
  roleTitle: text("role_title").notNull(),
  gender: text("gender").notNull().default("male"),
  mode: text("mode").notNull().default("zero_shot"), // "finetuned" | "zero_shot"
  basePitchHz: real("base_pitch_hz").notNull().default(120),
  refDurationSec: real("ref_duration_sec").notNull().default(14.5),
  refSampleRate: integer("ref_sample_rate").notNull().default(24000),
  refAudioFile: text("ref_audio_file").notNull(),
  latentCached: boolean("latent_cached").notNull().default(true),
  voicePersona: text("voice_persona").notNull().default("natural"),
  similarityScore: real("similarity_score").notNull().default(97.5),
  styleVectorDim: integer("style_vector_dim").notNull().default(256),
  checkpointName: text("checkpoint_name").notNull().default("styletts2_fa_en_base"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  publisherName: text("publisher_name").notNull().default("زومیت"),
  category: text("category").notNull().default("فناوری و هوش مصنوعی"),
  rawText: text("raw_text").notNull(),
  normalizedText: text("normalized_text").notNull(),
  chunksJson: jsonb("chunks_json").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("approved"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const synthesisJobs = pgTable("synthesis_jobs", {
  id: serial("id").primaryKey(),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  speakerId: integer("speaker_id")
    .notNull()
    .references(() => speakers.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("completed"), // "queued" | "processing" | "completed" | "failed"
  speed: real("speed").notNull().default(1.0),
  alpha: real("alpha").notNull().default(0.28),
  beta: real("beta").notNull().default(0.72),
  diffusionSteps: integer("diffusion_steps").notNull().default(8),
  embeddingScale: real("embedding_scale").notNull().default(1.15),
  temperature: real("temperature").notNull().default(0.65),
  repetitionPenalty: real("repetition_penalty").notNull().default(5.0),
  audioFilename: text("audio_filename").notNull(),
  durationSec: real("duration_sec").notNull(),
  sampleRate: integer("sample_rate").notNull().default(24000),
  fileSizeBytes: integer("file_size_bytes").notNull().default(0),
  chunkCount: integer("chunk_count").notNull().default(1),
  rtf: real("rtf").notNull().default(0.24),
  lufs: real("lufs").notNull().default(-16.0),
  waveformPeaks: jsonb("waveform_peaks").$type<number[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const finetuneRuns = pgTable("finetune_runs", {
  id: serial("id").primaryKey(),
  runName: text("run_name").notNull().unique(),
  speakerName: text("speaker_name").notNull(),
  speakerDisplayName: text("speaker_display_name").notNull(),
  datasetName: text("dataset_name").notNull(),
  datasetDurationMin: real("dataset_duration_min").notNull(),
  trainSegments: integer("train_segments").notNull(),
  evalSegments: integer("eval_segments").notNull(),
  rejectedSegments: integer("rejected_segments").notNull().default(0),
  sampleManifest: jsonb("sample_manifest")
    .$type<LJSpeechSegmentPreview[]>()
    .notNull()
    .default([]),
  engineType: text("engine_type").notNull().default("styletts2"),
  epochs: integer("epochs").notNull().default(30),
  batchSize: integer("batch_size").notNull().default(8),
  gradAccumSteps: integer("grad_accum_steps").notNull().default(4),
  learningRate: text("learning_rate").notNull().default("1e-4"),
  alpha: real("alpha").notNull().default(0.28),
  beta: real("beta").notNull().default(0.72),
  diffusionSteps: integer("diffusion_steps").notNull().default(8),
  slmAdversarial: boolean("slm_adversarial").notNull().default(true),
  status: text("status").notNull().default("completed"),
  isActive: boolean("is_active").notNull().default(false),
  initialMelLoss: real("initial_mel_loss").notNull().default(0.74),
  finalMelLoss: real("final_mel_loss").notNull().default(0.18),
  lossHistory: jsonb("loss_history")
    .$type<LossHistoryPoint[]>()
    .notNull()
    .default([]),
  checkpointPath: text("checkpoint_path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const publisherClients = pgTable("publisher_clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  apiKeyPrefix: text("api_key_prefix").notNull(),
  apiKeyHash: text("api_key_hash").notNull(),
  gpuSpec: text("gpu_spec").notNull(),
  bundleVersion: text("bundle_version").notNull().default("styletts2-fa-en-enterprise-3.0"),
  accentColor: text("accent_color").notNull().default("#e11d48"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
