CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`importance` text DEFAULT 'normal' NOT NULL,
	`due_at` text,
	`is_all_day` integer DEFAULT false NOT NULL,
	`scheduled_start` text,
	`scheduled_end` text,
	`estimate_minutes` integer,
	`goal_id` text,
	`source_module` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_items_scheduled_start` ON `items` (`scheduled_start`);--> statement-breakpoint
CREATE INDEX `idx_items_due_at` ON `items` (`due_at`);--> statement-breakpoint
CREATE INDEX `idx_items_status` ON `items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_items_source_module` ON `items` (`source_module`);