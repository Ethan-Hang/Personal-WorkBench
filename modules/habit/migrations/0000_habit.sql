CREATE TABLE `habit_checkins` (
	`habit_id` text NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`habit_id`, `date`),
	CONSTRAINT "ck_habit_checkins_value" CHECK("habit_checkins"."value" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_habit_checkins_date` ON `habit_checkins` (`date`);--> statement-breakpoint
CREATE TABLE `habit_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`target_value` integer DEFAULT 1 NOT NULL,
	`unit` text,
	`freq_kind` text NOT NULL,
	`weekdays` text,
	`weekly_count` integer,
	`start_date` text NOT NULL,
	`archived_at` text,
	`color_token` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "ck_habit_definitions_target" CHECK("habit_definitions"."target_value" >= 1),
	CONSTRAINT "ck_habit_definitions_position" CHECK("habit_definitions"."position" >= 0),
	CONSTRAINT "ck_habit_definitions_freq" CHECK(freq_kind IN ('daily', 'weekdays', 'weekly-count')),
	CONSTRAINT "ck_habit_definitions_weekly_count" CHECK("habit_definitions"."weekly_count" IS NULL OR ("habit_definitions"."weekly_count" BETWEEN 1 AND 7))
);
--> statement-breakpoint
CREATE INDEX `idx_habit_definitions_archived_at` ON `habit_definitions` (`archived_at`);