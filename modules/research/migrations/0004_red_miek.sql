CREATE TABLE `research_annotated_export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`options_json` text NOT NULL,
	`target_path` text NOT NULL,
	`temp_path` text,
	`completed_annotations` integer DEFAULT 0 NOT NULL,
	`total_annotations` integer DEFAULT 0 NOT NULL,
	`report_json` text,
	`error_code` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_research_annotated_export_jobs_status" CHECK(status IN ('queued', 'running', 'paused', 'completed', 'cancelled', 'failed', 'interrupted')),
	CONSTRAINT "ck_research_annotated_export_jobs_progress" CHECK("research_annotated_export_jobs"."completed_annotations" >= 0 AND "research_annotated_export_jobs"."total_annotations" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_research_annotated_export_jobs_asset` ON `research_annotated_export_jobs` (`asset_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_annotation_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`annotation_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`annotation_id`) REFERENCES `research_annotations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_research_annotation_revisions_revision" CHECK("research_annotation_revisions"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_annotation_revisions_number` ON `research_annotation_revisions` (`annotation_id`,`revision`);--> statement-breakpoint
CREATE TABLE `research_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`edition_id` text,
	`context_id` text,
	`kind` text NOT NULL,
	`page_number` integer NOT NULL,
	`anchor_json` text NOT NULL,
	`body` text,
	`color` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edition_id`) REFERENCES `research_editions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`context_id`) REFERENCES `research_reading_contexts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_research_annotations_kind" CHECK(kind IN ('highlight', 'underline', 'strikeout', 'area', 'note', 'bookmark')),
	CONSTRAINT "ck_research_annotations_status" CHECK(status IN ('active', 'deleted', 'needs-review')),
	CONSTRAINT "ck_research_annotations_page" CHECK("research_annotations"."page_number" >= 1),
	CONSTRAINT "ck_research_annotations_revision" CHECK("research_annotations"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_research_annotations_asset_page` ON `research_annotations` (`asset_id`,`page_number`);--> statement-breakpoint
CREATE INDEX `idx_research_annotations_context` ON `research_annotations` (`context_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_asset_reader_state` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`page_number` integer DEFAULT 1 NOT NULL,
	`page_offset_ratio` real DEFAULT 0 NOT NULL,
	`zoom` real DEFAULT 1 NOT NULL,
	`rotation` integer DEFAULT 0 NOT NULL,
	`layout` text DEFAULT 'continuous' NOT NULL,
	`last_context_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_context_id`) REFERENCES `research_reading_contexts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_research_reader_state_page" CHECK("research_asset_reader_state"."page_number" >= 1),
	CONSTRAINT "ck_research_reader_state_offset" CHECK("research_asset_reader_state"."page_offset_ratio" BETWEEN 0.0 AND 1.0),
	CONSTRAINT "ck_research_reader_state_zoom" CHECK("research_asset_reader_state"."zoom" BETWEEN 0.1 AND 8.0),
	CONSTRAINT "ck_research_reader_state_rotation" CHECK(rotation IN ('0', '90', '180', '270')),
	CONSTRAINT "ck_research_reader_state_layout" CHECK(layout IN ('continuous', 'single-page')),
	CONSTRAINT "ck_research_reader_state_revision" CHECK("research_asset_reader_state"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_research_reader_state_context` ON `research_asset_reader_state` (`last_context_id`);--> statement-breakpoint
CREATE TABLE `research_collection_contexts` (
	`collection_id` text PRIMARY KEY NOT NULL,
	`context_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `research_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_id`) REFERENCES `research_reading_contexts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_research_collection_contexts_context` ON `research_collection_contexts` (`context_id`);--> statement-breakpoint
CREATE TABLE `research_ocr_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`languages_json` text NOT NULL,
	`engine` text NOT NULL,
	`engine_version` text NOT NULL,
	`language_pack_version` text NOT NULL,
	`next_page` integer DEFAULT 1 NOT NULL,
	`total_pages` integer DEFAULT 0 NOT NULL,
	`temp_root` text,
	`error_code` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_research_ocr_jobs_status" CHECK(status IN ('queued', 'running', 'paused', 'completed', 'cancelled', 'failed', 'interrupted')),
	CONSTRAINT "ck_research_ocr_jobs_progress" CHECK("research_ocr_jobs"."next_page" >= 1 AND "research_ocr_jobs"."total_pages" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_research_ocr_jobs_asset_status` ON `research_ocr_jobs` (`asset_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_page_text` (
	`asset_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`source` text NOT NULL,
	`content_hash` text NOT NULL,
	`text_content` text NOT NULL,
	`position_json` text,
	`generator` text NOT NULL,
	`generator_version` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`asset_id`, `page_number`),
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_research_page_text_page" CHECK("research_page_text"."page_number" >= 1),
	CONSTRAINT "ck_research_page_text_source" CHECK(source IN ('pdf', 'ocr'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_page_text_generator` ON `research_page_text` (`asset_id`,`generator`,`generator_version`);--> statement-breakpoint
CREATE TABLE `research_reading_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`description` text,
	`color` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`archived_at` text,
	CONSTRAINT "ck_research_reading_contexts_status" CHECK(status IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_reading_contexts_active_name` ON `research_reading_contexts` (`normalized_name`) WHERE "research_reading_contexts"."status" = 'active';--> statement-breakpoint
CREATE INDEX `idx_research_reading_contexts_status` ON `research_reading_contexts` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_text_index_jobs` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`next_page` integer DEFAULT 1 NOT NULL,
	`total_pages` integer DEFAULT 0 NOT NULL,
	`asset_hash` text NOT NULL,
	`parser_version` text NOT NULL,
	`error_code` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_research_text_index_jobs_status" CHECK(status IN ('queued', 'running', 'paused', 'completed', 'cancelled', 'failed', 'interrupted')),
	CONSTRAINT "ck_research_text_index_jobs_progress" CHECK("research_text_index_jobs"."next_page" >= 1 AND "research_text_index_jobs"."total_pages" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_research_text_index_jobs_status` ON `research_text_index_jobs` (`status`,`updated_at`);
--> statement-breakpoint
CREATE VIRTUAL TABLE research_page_text_fts USING fts5(
	text_content,
	content = 'research_page_text',
	content_rowid = 'rowid',
	tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER research_page_text_fts_insert
AFTER INSERT ON research_page_text BEGIN
	INSERT INTO research_page_text_fts(rowid, text_content)
	VALUES (NEW.rowid, NEW.text_content);
END;
--> statement-breakpoint
CREATE TRIGGER research_page_text_fts_delete
AFTER DELETE ON research_page_text BEGIN
	INSERT INTO research_page_text_fts(research_page_text_fts, rowid, text_content)
	VALUES ('delete', OLD.rowid, OLD.text_content);
END;
--> statement-breakpoint
CREATE TRIGGER research_page_text_fts_update
AFTER UPDATE ON research_page_text BEGIN
	INSERT INTO research_page_text_fts(research_page_text_fts, rowid, text_content)
	VALUES ('delete', OLD.rowid, OLD.text_content);
	INSERT INTO research_page_text_fts(rowid, text_content)
	VALUES (NEW.rowid, NEW.text_content);
END;
