CREATE TABLE `research_metadata_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`lookup_key` text NOT NULL,
	`status` text NOT NULL,
	`value_json` text,
	`source_record_id` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_record_id`) REFERENCES `research_source_records`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_research_metadata_cache_status" CHECK(status IN ('success', 'not-found', 'transient-failure'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_metadata_cache_expiry` ON `research_metadata_cache` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_metadata_cache_lookup` ON `research_metadata_cache` (`provider`,`lookup_key`);