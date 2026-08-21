-- 手工补过一处：notes_todo_links.todo_item_id 的 FOREIGN KEY → items(id)。
-- drizzle 的 schema 里写不出这条外键（它指向 core 的表，而模块不得 import
-- @workbench/data），所以生成后手动加在这里；modules/todo 的迁移是同样的做法。
-- **重新生成本迁移时要记得把它加回去。**
CREATE TABLE `notes_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`icon` text DEFAULT '📁' NOT NULL,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "ck_notes_folders_sort_order" CHECK("notes_folders"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_notes_folders_parent_id` ON `notes_folders` (`parent_id`);--> statement-breakpoint
CREATE TABLE `notes_records` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`color` text DEFAULT 'yellow' NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`trashed_at` text,
	CONSTRAINT "ck_notes_records_status" CHECK(status IN ('active', 'archived', 'trashed')),
	CONSTRAINT "ck_notes_records_revision" CHECK("notes_records"."revision" >= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_notes_records_folder_id` ON `notes_records` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_records_status_updated_at` ON `notes_records` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_notes_records_pinned` ON `notes_records` (`is_pinned`);--> statement-breakpoint
CREATE TABLE `notes_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes_records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notes_tags_name` ON `notes_tags` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notes_tags_note_name` ON `notes_tags` (`note_id`,`name`);--> statement-breakpoint
CREATE TABLE `notes_todo_links` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`todo_item_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`todo_item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_notes_todo_links_item_id` ON `notes_todo_links` (`todo_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notes_todo_links_note_item` ON `notes_todo_links` (`note_id`,`todo_item_id`);
