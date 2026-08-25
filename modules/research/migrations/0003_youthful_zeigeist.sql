CREATE TABLE `research_managed_root_migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_root` text NOT NULL,
	`target_root` text NOT NULL,
	`total_objects` integer DEFAULT 0 NOT NULL,
	`copied_objects` integer DEFAULT 0 NOT NULL,
	`total_bytes` integer DEFAULT 0 NOT NULL,
	`copied_bytes` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	CONSTRAINT "ck_research_managed_root_migrations_status" CHECK(status IN ('draft', 'running', 'completed', 'cancelled', 'failed', 'interrupted')),
	CONSTRAINT "ck_research_managed_root_migrations_progress" CHECK("research_managed_root_migrations"."total_objects" >= 0 AND "research_managed_root_migrations"."copied_objects" >= 0 AND "research_managed_root_migrations"."total_bytes" >= 0 AND "research_managed_root_migrations"."copied_bytes" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_research_managed_root_migrations_status` ON `research_managed_root_migrations` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_storage_config` (
	`id` text PRIMARY KEY NOT NULL,
	`active_root` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
