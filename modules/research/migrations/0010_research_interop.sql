CREATE TABLE `research_interop_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`format` text NOT NULL,
	`display_name` text NOT NULL,
	`source_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`byte_size` integer NOT NULL,
	`encoding` text DEFAULT 'utf-8' NOT NULL,
	`parser_name` text NOT NULL,
	`parser_version` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT `ck_research_interop_sources_format` CHECK(`format` IN ('bibtex', 'ris', 'csl-json')),
	CONSTRAINT `ck_research_interop_sources_hash` CHECK(length(`content_hash`) = 64 AND `content_hash` NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT `ck_research_interop_sources_size` CHECK(`byte_size` BETWEEN 0 AND 52428800),
	CONSTRAINT `ck_research_interop_sources_encoding` CHECK(`encoding` = 'utf-8')
);
--> statement-breakpoint
CREATE INDEX `idx_research_interop_sources_hash_format` ON `research_interop_sources` (`content_hash`,`format`);
--> statement-breakpoint
CREATE TABLE `research_interop_import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`request_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`checkpoint_ordinal` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_detail` text,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`source_id`) REFERENCES `research_interop_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ck_research_interop_import_jobs_status` CHECK(`status` IN ('draft', 'parsing', 'awaiting-review', 'committing', 'completed', 'cancelled', 'failed', 'interrupted')),
	CONSTRAINT `ck_research_interop_import_jobs_counts` CHECK(`total_count` >= 0 AND `processed_count` BETWEEN 0 AND `total_count` AND `checkpoint_ordinal` >= 0),
	CONSTRAINT `ck_research_interop_import_jobs_revision` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_interop_import_jobs_request` ON `research_interop_import_jobs` (`request_id`);
--> statement-breakpoint
CREATE INDEX `idx_research_interop_import_jobs_status` ON `research_interop_import_jobs` (`status`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_research_interop_import_jobs_source` ON `research_interop_import_jobs` (`source_id`);
--> statement-breakpoint
CREATE TABLE `research_interop_records` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`job_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`source_key` text,
	`raw_hash` text NOT NULL,
	`raw_record` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`format_shadow_json` text DEFAULT '{}' NOT NULL,
	`mapped_json` text,
	`diagnostics_json` text DEFAULT '[]' NOT NULL,
	`decision_json` text,
	`status` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`committed_source_record_id` text,
	`committed_work_id` text,
	`committed_edition_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `research_interop_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `research_interop_import_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`committed_source_record_id`) REFERENCES `research_source_records`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`committed_work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`committed_edition_id`) REFERENCES `research_editions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `ck_research_interop_records_ordinal` CHECK(`ordinal` >= 0),
	CONSTRAINT `ck_research_interop_records_hash` CHECK(length(`raw_hash`) = 64 AND `raw_hash` NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT `ck_research_interop_records_status` CHECK(`status` IN ('valid', 'invalid', 'needs-review', 'accepted', 'skipped', 'committed', 'failed')),
	CONSTRAINT `ck_research_interop_records_revision` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_interop_records_source_ordinal` ON `research_interop_records` (`source_id`,`ordinal`);
--> statement-breakpoint
CREATE INDEX `idx_research_interop_records_job_status` ON `research_interop_records` (`job_id`,`status`,`ordinal`);
--> statement-breakpoint
CREATE INDEX `idx_research_interop_records_source_key` ON `research_interop_records` (`source_id`,`source_key`);
--> statement-breakpoint
CREATE INDEX `idx_research_interop_records_key_hash` ON `research_interop_records` (`source_key`,`raw_hash`);
--> statement-breakpoint
CREATE INDEX `idx_research_interop_records_raw_hash` ON `research_interop_records` (`raw_hash`);
--> statement-breakpoint
CREATE TABLE `research_interop_record_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`work_id` text,
	`edition_id` text,
	`action` text NOT NULL,
	`is_current` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `research_interop_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`edition_id`) REFERENCES `research_editions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `ck_research_interop_record_entities_action` CHECK(`action` IN ('created', 'new-edition', 'matched', 'suggestions-only'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_interop_record_entities_current` ON `research_interop_record_entities` (`record_id`) WHERE `is_current` = 1;
--> statement-breakpoint
CREATE INDEX `idx_research_interop_record_entities_work` ON `research_interop_record_entities` (`work_id`,`edition_id`);
--> statement-breakpoint
CREATE TABLE `research_interop_export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`format` text NOT NULL,
	`scope_json` text NOT NULL,
	`edition_policy` text DEFAULT 'preferred' NOT NULL,
	`frozen_entities_json` text NOT NULL,
	`preview_token` text,
	`target_path` text,
	`loss_report_json` text,
	`result_json` text,
	`error_code` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	CONSTRAINT `ck_research_interop_export_jobs_status` CHECK(`status` IN ('draft', 'previewed', 'running', 'completed', 'cancelled', 'failed')),
	CONSTRAINT `ck_research_interop_export_jobs_format` CHECK(`format` IN ('bibtex', 'ris', 'csl-json')),
	CONSTRAINT `ck_research_interop_export_jobs_edition_policy` CHECK(`edition_policy` IN ('preferred', 'all')),
	CONSTRAINT `ck_research_interop_export_jobs_revision` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_interop_export_jobs_request` ON `research_interop_export_jobs` (`request_id`);
--> statement-breakpoint
CREATE INDEX `idx_research_interop_export_jobs_status` ON `research_interop_export_jobs` (`status`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `research_citation_key_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`edition_id` text,
	`preferred_key` text NOT NULL,
	`source` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edition_id`) REFERENCES `research_editions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `ck_research_citation_key_preferences_source` CHECK(`source` IN ('generated', 'imported', 'user')),
	CONSTRAINT `ck_research_citation_key_preferences_revision` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_citation_key_preferences_target` ON `research_citation_key_preferences` (`work_id`,ifnull(`edition_id`, ''));
--> statement-breakpoint
CREATE INDEX `idx_research_citation_key_preferences_key` ON `research_citation_key_preferences` (`preferred_key`);
