-- 手工修正 drizzle-kit 的生成物，两处：
-- 1. 它的 INSERT ... SELECT 把 `deadline_at` 也从旧表里选了出来，而旧表没有这一列
--    （整表重建时 drizzle-kit 按新列名生成 SELECT）。这里改成常量 NULL。
-- 2. 它按 schema.ts 重建，因此丢掉了 `item_id → items(id) ON DELETE SET NULL` 这条外键
--    ——那条是 0000 手写迁移加的，schema.ts 里没有声明（core 表不归本模块）。
--    丢了它，删掉 core Item 后 rounds.item_id 会变成悬空引用而不是被置空。
--
-- 为什么必须整表重建：本次要把 outcome 的 CHECK 从三取值扩到四取值（加 `completed`），
-- 而 SQLite 没有 ALTER TABLE DROP CONSTRAINT。rounds 不被任何表引用，重建是安全的。
--
-- 注意 PRAGMA foreign_keys 在事务内是 no-op（迁移器把整份包在事务里），保留只是无害；
-- rounds 只做子表，重建过程不触发任何外键动作。
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campus_recruit_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`scheduled_at` text,
	`deadline_at` text,
	`format` text,
	`duration_min` integer,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`outcome_at` text,
	`notes` text,
	`item_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `campus_recruit_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL,
	CONSTRAINT "ck_campus_recruit_rounds_sequence" CHECK("__new_campus_recruit_rounds"."sequence" > 0),
	CONSTRAINT "ck_campus_recruit_rounds_kind" CHECK("__new_campus_recruit_rounds"."kind" IN ('screening', 'assessment', 'written', 'technical', 'hr', 'other')),
	CONSTRAINT "ck_campus_recruit_rounds_outcome" CHECK("__new_campus_recruit_rounds"."outcome" IN ('pending', 'completed', 'passed', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_campus_recruit_rounds`("id", "application_id", "sequence", "kind", "name", "scheduled_at", "deadline_at", "format", "duration_min", "outcome", "outcome_at", "notes", "item_id", "created_at", "updated_at") SELECT "id", "application_id", "sequence", "kind", "name", "scheduled_at", NULL, "format", "duration_min", "outcome", "outcome_at", "notes", "item_id", "created_at", "updated_at" FROM `campus_recruit_rounds`;--> statement-breakpoint
DROP TABLE `campus_recruit_rounds`;--> statement-breakpoint
ALTER TABLE `__new_campus_recruit_rounds` RENAME TO `campus_recruit_rounds`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campus_recruit_round_sequence` ON `campus_recruit_rounds` (`application_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_rounds_application_id` ON `campus_recruit_rounds` (`application_id`);--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_rounds_kind` ON `campus_recruit_rounds` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_rounds_scheduled_at` ON `campus_recruit_rounds` (`scheduled_at`);
