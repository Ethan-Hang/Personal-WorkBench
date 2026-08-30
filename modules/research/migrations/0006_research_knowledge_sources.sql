CREATE TABLE `research_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`context_id`) REFERENCES `research_reading_contexts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_notes_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_notes_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_notes_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_notes_context_status` ON `research_notes` (`context_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE TABLE `research_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text,
	`work_id` text NOT NULL,
	`edition_id` text,
	`asset_id` text NOT NULL,
	`annotation_id` text NOT NULL,
	`source_snapshot_json` text NOT NULL,
	`source_kind` text NOT NULL,
	`title` text,
	`summary` text DEFAULT '' NOT NULL,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`context_id`) REFERENCES `research_reading_contexts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`edition_id`) REFERENCES `research_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`annotation_id`) REFERENCES `research_annotations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_evidence_source_kind` CHECK(`source_kind` IN ('pdf', 'ocr')),
	CONSTRAINT `ck_research_evidence_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_evidence_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_evidence_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_evidence_context_status` ON `research_evidence` (`context_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE INDEX `idx_research_evidence_work_status` ON `research_evidence` (`work_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE INDEX `idx_research_evidence_annotation` ON `research_evidence` (`annotation_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_research_evidence_asset` ON `research_evidence` (`asset_id`, `status`);
--> statement-breakpoint
CREATE TABLE `research_note_links` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`work_id` text,
	`annotation_id` text,
	`evidence_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`note_id`) REFERENCES `research_notes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`annotation_id`) REFERENCES `research_annotations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`evidence_id`) REFERENCES `research_evidence`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_note_links_target` CHECK((`work_id` IS NOT NULL) + (`annotation_id` IS NOT NULL) + (`evidence_id` IS NOT NULL) = 1),
	CONSTRAINT `ck_research_note_links_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_note_links_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_note_links_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_note_links_note` ON `research_note_links` (`note_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_note_links_active_work` ON `research_note_links` (`note_id`, `work_id`) WHERE `status` = 'active' AND `work_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_note_links_active_annotation` ON `research_note_links` (`note_id`, `annotation_id`) WHERE `status` = 'active' AND `annotation_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_note_links_active_evidence` ON `research_note_links` (`note_id`, `evidence_id`) WHERE `status` = 'active' AND `evidence_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `research_knowledge_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT `ck_research_knowledge_revisions_entity_type` CHECK(`entity_type` IN ('note', 'evidence', 'note-link', 'claim', 'claim-evidence', 'matrix', 'matrix-column', 'matrix-row', 'matrix-cell', 'matrix-cell-evidence', 'writing-document', 'writing-section', 'writing-block')),
	CONSTRAINT `ck_research_knowledge_revisions_reason` CHECK(`reason` IN ('update', 'delete', 'restore', 'rebind', 'move-context', 'link', 'unlink', 'archive', 'reorder', 'review')),
	CONSTRAINT `ck_research_knowledge_revisions_revision` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_knowledge_revisions_number` ON `research_knowledge_revisions` (`entity_type`, `entity_id`, `revision`);
--> statement-breakpoint
CREATE INDEX `idx_research_knowledge_revisions_entity` ON `research_knowledge_revisions` (`entity_type`, `entity_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `research_knowledge_search` (
	`rowid` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`context_id` text,
	`work_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`source_state` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`context_id`) REFERENCES `research_reading_contexts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_knowledge_search_entity_type` CHECK(`entity_type` IN ('note', 'evidence', 'claim', 'writing-document')),
	CONSTRAINT `ck_research_knowledge_search_status` CHECK(`status` IN ('active', 'archived', 'deleted', 'draft')),
	CONSTRAINT `ck_research_knowledge_search_source_state` CHECK(`source_state` IS NULL OR `source_state` IN ('current', 'annotation-revised', 'annotation-deleted', 'asset-mismatch', 'source-unavailable')),
	UNIQUE (`entity_type`, `entity_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_research_knowledge_search_context` ON `research_knowledge_search` (`context_id`, `status`, `updated_at`, `entity_id`);
--> statement-breakpoint
CREATE INDEX `idx_research_knowledge_search_work` ON `research_knowledge_search` (`work_id`, `status`, `updated_at`, `entity_id`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `research_knowledge_search_fts` USING fts5(
	`title`,
	`body`,
	content='research_knowledge_search',
	content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `research_knowledge_search_ai` AFTER INSERT ON `research_knowledge_search` BEGIN
	INSERT INTO `research_knowledge_search_fts` (`rowid`, `title`, `body`) VALUES (new.`rowid`, new.`title`, new.`body`);
END;
--> statement-breakpoint
CREATE TRIGGER `research_knowledge_search_ad` AFTER DELETE ON `research_knowledge_search` BEGIN
	INSERT INTO `research_knowledge_search_fts` (`research_knowledge_search_fts`, `rowid`, `title`, `body`) VALUES ('delete', old.`rowid`, old.`title`, old.`body`);
END;
--> statement-breakpoint
CREATE TRIGGER `research_knowledge_search_au` AFTER UPDATE ON `research_knowledge_search` BEGIN
	INSERT INTO `research_knowledge_search_fts` (`research_knowledge_search_fts`, `rowid`, `title`, `body`) VALUES ('delete', old.`rowid`, old.`title`, old.`body`);
	INSERT INTO `research_knowledge_search_fts` (`rowid`, `title`, `body`) VALUES (new.`rowid`, new.`title`, new.`body`);
END;
