CREATE TABLE `research_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text,
	`statement` text NOT NULL,
	`rationale` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`status_before_delete` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	FOREIGN KEY (`context_id`) REFERENCES `research_reading_contexts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_claims_statement` CHECK(length(trim(`statement`)) > 0),
	CONSTRAINT `ck_research_claims_status` CHECK(`status` IN ('draft', 'active', 'archived', 'deleted')),
	CONSTRAINT `ck_research_claims_previous_status` CHECK(`status_before_delete` IS NULL OR `status_before_delete` IN ('draft', 'active', 'archived')),
	CONSTRAINT `ck_research_claims_delete_state` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL) AND (`status` = 'deleted') = (`status_before_delete` IS NOT NULL)),
	CONSTRAINT `ck_research_claims_archive_state` CHECK((`status` = 'archived' OR (`status` = 'deleted' AND `status_before_delete` = 'archived')) = (`archived_at` IS NOT NULL)),
	CONSTRAINT `ck_research_claims_revision` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_research_claims_context_status` ON `research_claims` (`context_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE TABLE `research_claim_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`relation` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`claim_id`) REFERENCES `research_claims`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`evidence_id`) REFERENCES `research_evidence`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_claim_evidence_relation` CHECK(`relation` IN ('supports', 'refutes', 'qualifies')),
	CONSTRAINT `ck_research_claim_evidence_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_claim_evidence_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_claim_evidence_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_claim_evidence_claim` ON `research_claim_evidence` (`claim_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE INDEX `idx_research_claim_evidence_evidence` ON `research_claim_evidence` (`evidence_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_claim_evidence_active` ON `research_claim_evidence` (`claim_id`, `evidence_id`) WHERE `status` = 'active';
--> statement-breakpoint
CREATE TABLE `research_matrices` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`status_before_delete` text,
	`structure_revision` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	FOREIGN KEY (`context_id`) REFERENCES `research_reading_contexts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_matrices_title` CHECK(length(trim(`title`)) > 0),
	CONSTRAINT `ck_research_matrices_status` CHECK(`status` IN ('active', 'archived', 'deleted')),
	CONSTRAINT `ck_research_matrices_previous_status` CHECK(`status_before_delete` IS NULL OR `status_before_delete` IN ('active', 'archived')),
	CONSTRAINT `ck_research_matrices_delete_state` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL) AND (`status` = 'deleted') = (`status_before_delete` IS NOT NULL)),
	CONSTRAINT `ck_research_matrices_archive_state` CHECK((`status` = 'archived' OR (`status` = 'deleted' AND `status_before_delete` = 'archived')) = (`archived_at` IS NOT NULL)),
	CONSTRAINT `ck_research_matrices_structure_revision` CHECK(`structure_revision` >= 1),
	CONSTRAINT `ck_research_matrices_revision` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_research_matrices_context_status` ON `research_matrices` (`context_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE TABLE `research_matrix_columns` (
	`id` text PRIMARY KEY NOT NULL,
	`matrix_id` text NOT NULL,
	`work_id` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`matrix_id`) REFERENCES `research_matrices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_matrix_columns_position` CHECK(`position` >= 0),
	CONSTRAINT `ck_research_matrix_columns_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_matrix_columns_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_matrix_columns_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_matrix_columns_order` ON `research_matrix_columns` (`matrix_id`, `status`, `position`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_matrix_columns_active_work` ON `research_matrix_columns` (`matrix_id`, `work_id`) WHERE `status` = 'active';
--> statement-breakpoint
CREATE TABLE `research_matrix_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`matrix_id` text NOT NULL,
	`kind` text NOT NULL,
	`claim_id` text,
	`title` text,
	`question` text,
	`position` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`matrix_id`) REFERENCES `research_matrices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`claim_id`) REFERENCES `research_claims`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_matrix_rows_kind` CHECK(`kind` IN ('claim', 'dimension')),
	CONSTRAINT `ck_research_matrix_rows_target` CHECK((`kind` = 'claim' AND `claim_id` IS NOT NULL AND `title` IS NULL AND `question` IS NULL) OR (`kind` = 'dimension' AND `claim_id` IS NULL AND ((`title` IS NOT NULL AND length(trim(`title`)) > 0) OR (`question` IS NOT NULL AND length(trim(`question`)) > 0)))),
	CONSTRAINT `ck_research_matrix_rows_position` CHECK(`position` >= 0),
	CONSTRAINT `ck_research_matrix_rows_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_matrix_rows_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_matrix_rows_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_matrix_rows_order` ON `research_matrix_rows` (`matrix_id`, `status`, `position`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_matrix_rows_active_claim` ON `research_matrix_rows` (`matrix_id`, `claim_id`) WHERE `status` = 'active' AND `claim_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `research_matrix_cells` (
	`id` text PRIMARY KEY NOT NULL,
	`matrix_id` text NOT NULL,
	`row_id` text NOT NULL,
	`column_id` text NOT NULL,
	`synthesis` text DEFAULT '' NOT NULL,
	`review_baseline_json` text,
	`reviewed_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`matrix_id`) REFERENCES `research_matrices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`row_id`) REFERENCES `research_matrix_rows`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`column_id`) REFERENCES `research_matrix_columns`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_matrix_cells_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_matrix_cells_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_matrix_cells_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_matrix_cells_matrix` ON `research_matrix_cells` (`matrix_id`, `status`, `row_id`, `column_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_matrix_cells_active` ON `research_matrix_cells` (`row_id`, `column_id`) WHERE `status` = 'active';
--> statement-breakpoint
CREATE TABLE `research_matrix_cell_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`cell_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`cell_id`) REFERENCES `research_matrix_cells`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`evidence_id`) REFERENCES `research_evidence`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_matrix_cell_evidence_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_matrix_cell_evidence_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_matrix_cell_evidence_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_matrix_cell_evidence_cell` ON `research_matrix_cell_evidence` (`cell_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_matrix_cell_evidence_active` ON `research_matrix_cell_evidence` (`cell_id`, `evidence_id`) WHERE `status` = 'active';
--> statement-breakpoint
CREATE TABLE `research_note_links_new` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`work_id` text,
	`annotation_id` text,
	`evidence_id` text,
	`claim_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`note_id`) REFERENCES `research_notes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`annotation_id`) REFERENCES `research_annotations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`evidence_id`) REFERENCES `research_evidence`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`claim_id`) REFERENCES `research_claims`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_note_links_target` CHECK((`work_id` IS NOT NULL) + (`annotation_id` IS NOT NULL) + (`evidence_id` IS NOT NULL) + (`claim_id` IS NOT NULL) = 1),
	CONSTRAINT `ck_research_note_links_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_note_links_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_note_links_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `research_note_links_new` (`id`, `note_id`, `work_id`, `annotation_id`, `evidence_id`, `claim_id`, `status`, `revision`, `created_at`, `updated_at`, `deleted_at`)
SELECT `id`, `note_id`, `work_id`, `annotation_id`, `evidence_id`, NULL, `status`, `revision`, `created_at`, `updated_at`, `deleted_at` FROM `research_note_links`;
--> statement-breakpoint
DROP TABLE `research_note_links`;
--> statement-breakpoint
ALTER TABLE `research_note_links_new` RENAME TO `research_note_links`;
--> statement-breakpoint
CREATE INDEX `idx_research_note_links_note` ON `research_note_links` (`note_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_note_links_active_work` ON `research_note_links` (`note_id`, `work_id`) WHERE `status` = 'active' AND `work_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_note_links_active_annotation` ON `research_note_links` (`note_id`, `annotation_id`) WHERE `status` = 'active' AND `annotation_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_note_links_active_evidence` ON `research_note_links` (`note_id`, `evidence_id`) WHERE `status` = 'active' AND `evidence_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_note_links_active_claim` ON `research_note_links` (`note_id`, `claim_id`) WHERE `status` = 'active' AND `claim_id` IS NOT NULL;
