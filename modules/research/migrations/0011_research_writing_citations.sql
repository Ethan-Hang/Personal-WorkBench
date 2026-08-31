PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
ALTER TABLE `research_writing_blocks` RENAME TO `research_writing_blocks_d2_old`;
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
	`work_id` text,
	`edition_id` text,
	`citation_intent_json` text,
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
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`edition_id`) REFERENCES `research_editions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `ck_research_writing_blocks_kind` CHECK(`kind` IN ('text', 'note', 'evidence', 'claim', 'matrix', 'citation')),
	CONSTRAINT `ck_research_writing_blocks_content` CHECK(
		(`kind` = 'text' AND `text_content` IS NOT NULL AND `note_id` IS NULL AND `evidence_id` IS NULL AND `claim_id` IS NULL AND `matrix_id` IS NULL AND `work_id` IS NULL AND `edition_id` IS NULL AND `citation_intent_json` IS NULL AND `target_label` IS NULL) OR
		(`kind` = 'note' AND `text_content` IS NULL AND `note_id` IS NOT NULL AND `evidence_id` IS NULL AND `claim_id` IS NULL AND `matrix_id` IS NULL AND `work_id` IS NULL AND `edition_id` IS NULL AND `citation_intent_json` IS NULL AND `target_label` IS NOT NULL AND length(trim(`target_label`)) > 0) OR
		(`kind` = 'evidence' AND `text_content` IS NULL AND `note_id` IS NULL AND `evidence_id` IS NOT NULL AND `claim_id` IS NULL AND `matrix_id` IS NULL AND `work_id` IS NULL AND `edition_id` IS NULL AND `citation_intent_json` IS NULL AND `target_label` IS NOT NULL AND length(trim(`target_label`)) > 0) OR
		(`kind` = 'claim' AND `text_content` IS NULL AND `note_id` IS NULL AND `evidence_id` IS NULL AND `claim_id` IS NOT NULL AND `matrix_id` IS NULL AND `work_id` IS NULL AND `edition_id` IS NULL AND `citation_intent_json` IS NULL AND `target_label` IS NOT NULL AND length(trim(`target_label`)) > 0) OR
		(`kind` = 'matrix' AND `text_content` IS NULL AND `note_id` IS NULL AND `evidence_id` IS NULL AND `claim_id` IS NULL AND `matrix_id` IS NOT NULL AND `work_id` IS NULL AND `edition_id` IS NULL AND `citation_intent_json` IS NULL AND `target_label` IS NOT NULL AND length(trim(`target_label`)) > 0) OR
		(`kind` = 'citation' AND `text_content` IS NULL AND `note_id` IS NULL AND `evidence_id` IS NULL AND `claim_id` IS NULL AND `matrix_id` IS NULL AND `work_id` IS NOT NULL AND `citation_intent_json` IS NOT NULL AND json_valid(`citation_intent_json`) AND `target_label` IS NOT NULL AND length(trim(`target_label`)) > 0)
	),
	CONSTRAINT `ck_research_writing_blocks_position` CHECK(`position` >= 0),
	CONSTRAINT `ck_research_writing_blocks_status` CHECK(`status` IN ('active', 'deleted')),
	CONSTRAINT `ck_research_writing_blocks_revision` CHECK(`revision` >= 1),
	CONSTRAINT `ck_research_writing_blocks_deleted_at` CHECK((`status` = 'deleted') = (`deleted_at` IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `research_writing_blocks`
(`id`, `document_id`, `section_id`, `kind`, `text_content`, `note_id`, `evidence_id`, `claim_id`, `matrix_id`, `work_id`, `edition_id`, `citation_intent_json`, `target_label`, `position`, `status`, `revision`, `created_at`, `updated_at`, `deleted_at`)
SELECT `id`, `document_id`, `section_id`, `kind`, `text_content`, `note_id`, `evidence_id`, `claim_id`, `matrix_id`, NULL, NULL, NULL, `target_label`, `position`, `status`, `revision`, `created_at`, `updated_at`, `deleted_at`
FROM `research_writing_blocks_d2_old`;
--> statement-breakpoint
DROP TABLE `research_writing_blocks_d2_old`;
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
--> statement-breakpoint
CREATE INDEX `idx_research_writing_blocks_work` ON `research_writing_blocks` (`work_id`, `edition_id`, `status`);
