CREATE TABLE `todo_recurrence_items` (
	`recurrence_id` text NOT NULL,
	`occurrence_date` text NOT NULL,
	`item_id` text NOT NULL,
	PRIMARY KEY(`recurrence_id`, `occurrence_date`),
	FOREIGN KEY (`recurrence_id`) REFERENCES `todo_recurrences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_todo_recurrence_items_item_id` ON `todo_recurrence_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `todo_recurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`importance` text DEFAULT 'normal' NOT NULL,
	`notes` text,
	`freq` text NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`by_weekday` text,
	`by_monthday` integer,
	`start_date` text NOT NULL,
	`until_date` text,
	`materialized_through` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "ck_todo_recurrences_freq" CHECK("todo_recurrences"."freq" IN ('daily', 'weekly', 'monthly')),
	CONSTRAINT "ck_todo_recurrences_interval" CHECK("todo_recurrences"."interval" > 0),
	CONSTRAINT "ck_todo_recurrences_monthday" CHECK("todo_recurrences"."by_monthday" IS NULL OR ("todo_recurrences"."by_monthday" >= 1 AND "todo_recurrences"."by_monthday" <= 31))
);
--> statement-breakpoint
CREATE TABLE `todo_subtasks` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "ck_todo_subtasks_done" CHECK("todo_subtasks"."done" IN (0, 1)),
	CONSTRAINT "ck_todo_subtasks_position" CHECK("todo_subtasks"."position" >= 0),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_todo_subtasks_item_id` ON `todo_subtasks` (`item_id`);--> statement-breakpoint
CREATE TABLE `todo_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `todo_tags_name_unique` ON `todo_tags` (`name`);--> statement-breakpoint
CREATE INDEX `idx_todo_tags_name` ON `todo_tags` (`name`);--> statement-breakpoint
CREATE TABLE `todo_task_tags` (
	`item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`tag_id`) REFERENCES `todo_tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_todo_task_tags_tag_id` ON `todo_task_tags` (`tag_id`);
