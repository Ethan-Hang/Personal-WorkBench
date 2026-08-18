CREATE TABLE `campus_recruit_applications` (
  `id` text PRIMARY KEY NOT NULL,
  `company` text NOT NULL,
  `position` text NOT NULL,
  `company_type` text,
  `industry` text,
  `city` text,
  `channel` text,
  `referral` text,
  `priority` text DEFAULT 'B' NOT NULL CONSTRAINT `ck_campus_recruit_applications_priority` CHECK (`priority` IN ('S', 'A', 'B', 'C')),
  `apply_deadline_date` text,
  `applied_at` text,
  `outcome` text CONSTRAINT `ck_campus_recruit_applications_outcome` CHECK (`outcome` IS NULL OR `outcome` IN ('offer', 'oc', 'rejected', 'declined')),
  `outcome_at` text,
  `salary` text,
  `link` text,
  `notes` text,
  `deadline_item_id` text,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  FOREIGN KEY (`deadline_item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `campus_recruit_rounds` (
  `id` text PRIMARY KEY NOT NULL,
  `application_id` text NOT NULL,
  `sequence` integer NOT NULL CONSTRAINT `ck_campus_recruit_rounds_sequence` CHECK (`sequence` > 0),
  `kind` text NOT NULL CONSTRAINT `ck_campus_recruit_rounds_kind` CHECK (`kind` IN ('assessment', 'written', 'technical', 'hr', 'other')),
  `name` text NOT NULL,
  `scheduled_at` text,
  `format` text,
  `duration_min` integer,
  `outcome` text DEFAULT 'pending' NOT NULL CONSTRAINT `ck_campus_recruit_rounds_outcome` CHECK (`outcome` IN ('pending', 'passed', 'failed')),
  `outcome_at` text,
  `notes` text,
  `item_id` text,
  `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
  FOREIGN KEY (`application_id`) REFERENCES `campus_recruit_applications`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campus_recruit_round_sequence` ON `campus_recruit_rounds` (`application_id`, `sequence`);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_applications_applied_at` ON `campus_recruit_applications` (`applied_at`);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_applications_outcome` ON `campus_recruit_applications` (`outcome`);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_rounds_application_id` ON `campus_recruit_rounds` (`application_id`);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_rounds_kind` ON `campus_recruit_rounds` (`kind`);
--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_rounds_scheduled_at` ON `campus_recruit_rounds` (`scheduled_at`);
