CREATE TABLE `research_asset_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`mode` text NOT NULL,
	`original_path` text NOT NULL,
	`resolved_path` text NOT NULL,
	`object_key` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`device_id` text,
	`file_id` text,
	`observed_size` integer,
	`observed_mtime_ms` integer,
	`error_code` text,
	`last_checked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`recycled_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_research_asset_locations_mode" CHECK(mode IN ('managed', 'linked')),
	CONSTRAINT "ck_research_asset_locations_state" CHECK(state IN ('pending', 'available', 'missing', 'changed', 'recycled', 'error')),
	CONSTRAINT "ck_research_asset_locations_object_key" CHECK((mode = 'managed' AND object_key IS NOT NULL) OR (mode = 'linked' AND object_key IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_asset_locations_managed` ON `research_asset_locations` (`asset_id`) WHERE "research_asset_locations"."mode" = 'managed';--> statement-breakpoint
CREATE INDEX `idx_research_asset_locations_asset` ON `research_asset_locations` (`asset_id`);--> statement-breakpoint
CREATE INDEX `idx_research_asset_locations_state` ON `research_asset_locations` (`state`);--> statement-breakpoint
CREATE INDEX `idx_research_asset_locations_resolved` ON `research_asset_locations` (`resolved_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_asset_locations_identity` ON `research_asset_locations` (`asset_id`,`mode`,`original_path`);--> statement-breakpoint
CREATE TABLE `research_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`hash_algorithm` text DEFAULT 'sha256' NOT NULL,
	`content_hash` text NOT NULL,
	`byte_size` integer NOT NULL,
	`mime_type` text DEFAULT 'application/pdf' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`recycled_at` text,
	CONSTRAINT "ck_research_assets_algorithm" CHECK(hash_algorithm = 'sha256'),
	CONSTRAINT "ck_research_assets_hash" CHECK(length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "ck_research_assets_size" CHECK("research_assets"."byte_size" >= 0),
	CONSTRAINT "ck_research_assets_state" CHECK(state IN ('active', 'recycled'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_assets_state` ON `research_assets` (`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_assets_hash` ON `research_assets` (`hash_algorithm`,`content_hash`);--> statement-breakpoint
CREATE TABLE `research_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`role` text DEFAULT 'primary-pdf' NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`recycled_at` text,
	FOREIGN KEY (`edition_id`) REFERENCES `research_editions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_research_attachments_role" CHECK(role IN ('primary-pdf', 'supplement', 'dataset', 'code', 'web-snapshot', 'other')),
	CONSTRAINT "ck_research_attachments_status" CHECK(status IN ('active', 'recycled'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_attachments_asset` ON `research_attachments` (`asset_id`);--> statement-breakpoint
CREATE INDEX `idx_research_attachments_status` ON `research_attachments` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_attachments_relation` ON `research_attachments` (`edition_id`,`asset_id`,`role`);--> statement-breakpoint
CREATE TABLE `research_collection_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`work_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `research_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_collection_entries_work` ON `research_collection_entries` (`work_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_collection_entries` ON `research_collection_entries` (`collection_id`,`work_id`);--> statement-breakpoint
CREATE TABLE `research_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`kind` text DEFAULT 'manual' NOT NULL,
	`query_json` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`trashed_at` text,
	CONSTRAINT "ck_research_collections_kind" CHECK(kind IN ('manual', 'smart', 'system')),
	CONSTRAINT "ck_research_collections_sort" CHECK("research_collections"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_collections_root_name` ON `research_collections` (`normalized_name`) WHERE "research_collections"."parent_id" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_research_collections_parent` ON `research_collections` (`parent_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_collections_parent_name` ON `research_collections` (`parent_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `research_contributors` (
	`id` text PRIMARY KEY NOT NULL,
	`edition_id` text NOT NULL,
	`role` text DEFAULT 'author' NOT NULL,
	`display_name` text NOT NULL,
	`given_name` text,
	`family_name` text,
	`orcid` text,
	`sequence` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `research_editions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_research_contributors_sequence" CHECK("research_contributors"."sequence" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_research_contributors_name` ON `research_contributors` (`family_name`,`display_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_contributors_edition_sequence` ON `research_contributors` (`edition_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `research_editions` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`kind` text DEFAULT 'unknown' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`publication_title` text,
	`publisher` text,
	`published_date` text,
	`volume` text,
	`issue` text,
	`pages` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_research_editions_kind" CHECK(kind IN ('journal', 'conference', 'preprint', 'thesis', 'report', 'other', 'unknown')),
	CONSTRAINT "ck_research_editions_revision" CHECK("research_editions"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_research_editions_work` ON `research_editions` (`work_id`);--> statement-breakpoint
CREATE INDEX `idx_research_editions_published` ON `research_editions` (`published_date`);--> statement-breakpoint
CREATE TABLE `research_export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`options_json` text NOT NULL,
	`target_path` text,
	`manifest_json` text,
	`error_code` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	CONSTRAINT "ck_research_export_jobs_status" CHECK(status IN ('draft', 'running', 'completed', 'cancelled', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_export_jobs_status` ON `research_export_jobs` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `research_external_source_maps` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`last_fetched_at` text,
	`cache_status` text DEFAULT 'fresh' NOT NULL,
	`cache_expires_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "ck_research_external_maps_entity" CHECK(entity_type IN ('work', 'edition')),
	CONSTRAINT "ck_research_external_maps_cache" CHECK(cache_status IN ('fresh', 'not-found', 'transient-failure'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_external_maps_entity` ON `research_external_source_maps` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_external_maps_provider_id` ON `research_external_source_maps` (`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `research_identifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`scheme` text NOT NULL,
	`value` text NOT NULL,
	`normalized_value` text NOT NULL,
	`source_record_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "ck_research_identifiers_entity" CHECK(entity_type IN ('work', 'edition')),
	CONSTRAINT "ck_research_identifiers_scheme" CHECK(scheme IN ('doi', 'arxiv', 'isbn', 'issn', 'pmid', 'url'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_identifiers_entity` ON `research_identifiers` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_research_identifiers_lookup` ON `research_identifiers` (`scheme`,`normalized_value`);--> statement-breakpoint
CREATE TABLE `research_import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`file_name` text NOT NULL,
	`source_path` text NOT NULL,
	`storage_mode` text NOT NULL,
	`stage` text DEFAULT 'selected' NOT NULL,
	`asset_id` text,
	`work_id` text,
	`edition_id` text,
	`temp_path` text,
	`candidate_json` text,
	`decision_json` text,
	`error_code` text,
	`error_detail` text,
	`retryable` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `research_import_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`edition_id`) REFERENCES `research_editions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_research_import_items_mode" CHECK(storage_mode IN ('managed', 'linked')),
	CONSTRAINT "ck_research_import_items_stage" CHECK(stage IN ('selected', 'hashing', 'staged', 'object-ready', 'linked-verified', 'metadata', 'metadata-failed', 'awaiting-confirmation', 'database-committed', 'available', 'cancelled', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_import_items_session` ON `research_import_items` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_research_import_items_stage` ON `research_import_items` (`stage`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_research_import_items_asset` ON `research_import_items` (`asset_id`);--> statement-breakpoint
CREATE TABLE `research_import_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	CONSTRAINT "ck_research_import_sessions_status" CHECK(status IN ('draft', 'inspecting', 'awaiting-confirmation', 'committing', 'completed', 'cancelled', 'failed', 'reconciling')),
	CONSTRAINT "ck_research_import_sessions_count" CHECK("research_import_sessions"."item_count" BETWEEN 0 AND 200)
);
--> statement-breakpoint
CREATE INDEX `idx_research_import_sessions_status` ON `research_import_sessions` (`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_import_sessions_request` ON `research_import_sessions` (`request_id`);--> statement-breakpoint
CREATE TABLE `research_merge_records` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`survivor_id` text NOT NULL,
	`merged_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`status` text DEFAULT 'merged' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`reverted_at` text,
	CONSTRAINT "ck_research_merge_records_entity" CHECK(entity_type IN ('work', 'tag')),
	CONSTRAINT "ck_research_merge_records_status" CHECK(status IN ('merged', 'reverted'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_merge_records_survivor` ON `research_merge_records` (`entity_type`,`survivor_id`);--> statement-breakpoint
CREATE TABLE `research_metadata_assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`field_name` text NOT NULL,
	`value_json` text NOT NULL,
	`normalized_value` text,
	`source_kind` text NOT NULL,
	`source_record_id` text,
	`observed_at` text NOT NULL,
	`is_user_confirmed` integer DEFAULT false NOT NULL,
	`is_selected` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_record_id`) REFERENCES `research_source_records`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_research_metadata_assertions_entity" CHECK(entity_type IN ('work', 'edition')),
	CONSTRAINT "ck_research_metadata_assertions_source" CHECK(source_kind IN ('user', 'exact-external', 'external', 'embedded-pdf', 'first-page', 'filename'))
);
--> statement-breakpoint
CREATE INDEX `idx_research_metadata_assertions_entity` ON `research_metadata_assertions` (`entity_type`,`entity_id`,`field_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_metadata_assertions_selected` ON `research_metadata_assertions` (`entity_type`,`entity_id`,`field_name`) WHERE "research_metadata_assertions"."is_selected" = 1;--> statement-breakpoint
CREATE INDEX `idx_research_metadata_assertions_source_record` ON `research_metadata_assertions` (`source_record_id`);--> statement-breakpoint
CREATE TABLE `research_source_records` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`source_locator` text,
	`raw_format` text NOT NULL,
	`raw_payload` text NOT NULL,
	`parser_version` text NOT NULL,
	`observed_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_research_source_records_provider` ON `research_source_records` (`provider`,`source_locator`);--> statement-breakpoint
CREATE TABLE `research_tag_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `research_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_tag_aliases_tag` ON `research_tag_aliases` (`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_tag_aliases_name` ON `research_tag_aliases` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `research_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`color` text,
	`description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`trashed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_tags_name` ON `research_tags` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `research_work_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_work_id` text NOT NULL,
	`target_work_id` text NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_research_work_relations_kind" CHECK(kind IN ('related', 'extends', 'revises', 'cites')),
	CONSTRAINT "ck_research_work_relations_distinct" CHECK("research_work_relations"."source_work_id" <> "research_work_relations"."target_work_id")
);
--> statement-breakpoint
CREATE INDEX `idx_research_work_relations_target` ON `research_work_relations` (`target_work_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_work_relations` ON `research_work_relations` (`source_work_id`,`target_work_id`,`kind`);--> statement-breakpoint
CREATE TABLE `research_work_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `research_works`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `research_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_work_tags_tag` ON `research_work_tags` (`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_research_work_tags` ON `research_work_tags` (`work_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `research_works` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'unknown' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`title_sort` text DEFAULT '' NOT NULL,
	`abstract` text,
	`year` integer,
	`preferred_edition_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`redirect_to_work_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`trashed_at` text,
	CONSTRAINT "ck_research_works_type" CHECK(type IN ('article', 'conference-paper', 'preprint', 'thesis', 'book-chapter', 'report', 'standard', 'dataset', 'web', 'unknown')),
	CONSTRAINT "ck_research_works_status" CHECK(status IN ('active', 'trashed', 'merged')),
	CONSTRAINT "ck_research_works_revision" CHECK("research_works"."revision" >= 1),
	CONSTRAINT "ck_research_works_year" CHECK("research_works"."year" IS NULL OR "research_works"."year" BETWEEN 0 AND 9999)
);
--> statement-breakpoint
CREATE INDEX `idx_research_works_status_updated` ON `research_works` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_research_works_title_sort` ON `research_works` (`title_sort`);--> statement-breakpoint
CREATE INDEX `idx_research_works_redirect` ON `research_works` (`redirect_to_work_id`);