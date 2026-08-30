CREATE TABLE `research_writing_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`context_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`status_before_delete` text,
	`structure_revision` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	FOREIGN KEY (`context_id`) REFERENCES `research_reading_contexts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_writing_documents_title` CHECK(length(trim(`title`)) > 0),
	CONSTRAINT `ck_research_writing_documents_status` CHECK(`status` IN ('active', 'archived', 'deleted')),
	CONSTRAINT `ck_research_writing_documents_previous_status` CHECK(`status_before_delete` IS NULL OR `status_before_delete` IN ('active', 'archived')),
	CONSTRAINT `ck_research_writing_documents_delete_state` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL) AND (`status` = 'deleted') = (`status_before_delete` IS NOT NULL)),
	CONSTRAINT `ck_research_writing_documents_archive_state` CHECK((`status` = 'archived' OR (`status` = 'deleted' AND `status_before_delete` = 'archived')) = (`archived_at` IS NOT NULL)),
	CONSTRAINT `ck_research_writing_documents_structure_revision` CHECK(`structure_revision` >= 1),
	CONSTRAINT `ck_research_writing_documents_revision` CHECK(`revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_research_writing_documents_context_status` ON `research_writing_documents` (`context_id`, `status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE TABLE `research_writing_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`document_id`) REFERENCES `research_writing_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_writing_sections_title` CHECK(length(trim(`title`)) > 0),
	CONSTRAINT `ck_research_writing_sections_position` CHECK(`position` >= 0),
	CONSTRAINT `ck_research_writing_sections_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_writing_sections_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_writing_sections_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_writing_sections_order` ON `research_writing_sections` (`document_id`, `status`, `position`, `id`);
--> statement-breakpoint
CREATE TABLE `research_writing_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`section_id` text NOT NULL,
	`kind` text NOT NULL,
	`text_content` text,
	`note_id` text,
	`evidence_id` text,
	`claim_id` text,
	`matrix_id` text,
	`target_label` text,
	`position` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`document_id`) REFERENCES `research_writing_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`section_id`) REFERENCES `research_writing_sections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`note_id`) REFERENCES `research_notes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`evidence_id`) REFERENCES `research_evidence`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`claim_id`) REFERENCES `research_claims`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`matrix_id`) REFERENCES `research_matrices`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_writing_blocks_kind` CHECK(`kind` IN ('text', 'note', 'evidence', 'claim', 'matrix')),
	CONSTRAINT `ck_research_writing_blocks_content` CHECK((`kind` = 'text' AND `text_content` IS NOT NULL AND `note_id` IS NULL AND `evidence_id` IS NULL AND `claim_id` IS NULL AND `matrix_id` IS NULL AND `target_label` IS NULL) OR (`kind` = 'note' AND `text_content` IS NULL AND `note_id` IS NOT NULL AND `evidence_id` IS NULL AND `claim_id` IS NULL AND `matrix_id` IS NULL AND `target_label` IS NOT NULL AND length(trim(`target_label`)) > 0) OR (`kind` = 'evidence' AND `text_content` IS NULL AND `note_id` IS NULL AND `evidence_id` IS NOT NULL AND `claim_id` IS NULL AND `matrix_id` IS NULL AND `target_label` IS NOT NULL AND length(trim(`target_label`)) > 0) OR (`kind` = 'claim' AND `text_content` IS NULL AND `note_id` IS NULL AND `evidence_id` IS NULL AND `claim_id` IS NOT NULL AND `matrix_id` IS NULL AND `target_label` IS NOT NULL AND length(trim(`target_label`)) > 0) OR (`kind` = 'matrix' AND `text_content` IS NULL AND `note_id` IS NULL AND `evidence_id` IS NULL AND `claim_id` IS NULL AND `matrix_id` IS NOT NULL AND `target_label` IS NOT NULL AND length(trim(`target_label`)) > 0)),
	CONSTRAINT `ck_research_writing_blocks_position` CHECK(`position` >= 0),
	CONSTRAINT `ck_research_writing_blocks_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_writing_blocks_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_writing_blocks_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_research_writing_blocks_order` ON `research_writing_blocks` (`section_id`, `status`, `position`, `id`);
--> statement-breakpoint
CREATE INDEX `idx_research_writing_blocks_document` ON `research_writing_blocks` (`document_id`, `status`, `section_id`, `position`, `id`);
--> statement-breakpoint
CREATE INDEX `idx_research_writing_blocks_note` ON `research_writing_blocks` (`note_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_research_writing_blocks_evidence` ON `research_writing_blocks` (`evidence_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_research_writing_blocks_claim` ON `research_writing_blocks` (`claim_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_research_writing_blocks_matrix` ON `research_writing_blocks` (`matrix_id`, `status`);
