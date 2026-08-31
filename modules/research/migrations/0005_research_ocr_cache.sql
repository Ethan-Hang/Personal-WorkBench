ALTER TABLE `research_ocr_jobs` ADD `asset_hash` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE `research_ocr_page_cache` (
	`asset_id` text NOT NULL,
	`asset_hash` text NOT NULL,
	`page_number` integer NOT NULL,
	`languages_key` text NOT NULL,
	`engine` text NOT NULL,
	`engine_version` text NOT NULL,
	`language_pack_version` text NOT NULL,
	`text_content` text NOT NULL,
	`position_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`asset_id`, `asset_hash`, `page_number`, `languages_key`, `engine`, `engine_version`, `language_pack_version`),
	FOREIGN KEY (`asset_id`) REFERENCES `research_assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_research_ocr_page_cache_page" CHECK("research_ocr_page_cache"."page_number" >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_research_ocr_page_cache_lookup` ON `research_ocr_page_cache` (`asset_id`,`asset_hash`,`languages_key`,`engine`,`engine_version`,`language_pack_version`,`page_number`);
