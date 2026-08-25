-- 三步顺序是承重的：先建季表，再插入默认季，最后加列并回填。
-- 固定 id 而非随机 UUID：迁移是纯 SQL，没有生成 UUID 的能力；固定值也让
-- 「两台机器的库能不能对上」这个问题有答案。
-- season_id 刻意可空：带 NOT NULL 就必须带 DEFAULT，而那个 DEFAULT 会永久
-- 留在 schema 里，将来漏传 seasonId 不会报错、会静默落进 legacy 季。
CREATE TABLE `campus_recruit_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`archived_at` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "ck_campus_recruit_seasons_kind" CHECK("campus_recruit_seasons"."kind" IN ('campus-autumn', 'campus-spring', 'intern', 'social'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campus_recruit_seasons_name` ON `campus_recruit_seasons` (`name`);--> statement-breakpoint
INSERT INTO `campus_recruit_seasons` (`id`, `name`, `kind`) VALUES ('season-legacy-autumn', '秋招', 'campus-autumn');--> statement-breakpoint
ALTER TABLE `campus_recruit_applications` ADD `season_id` text REFERENCES campus_recruit_seasons(id);--> statement-breakpoint
UPDATE `campus_recruit_applications` SET `season_id` = 'season-legacy-autumn' WHERE `season_id` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_campus_recruit_applications_season_id` ON `campus_recruit_applications` (`season_id`);