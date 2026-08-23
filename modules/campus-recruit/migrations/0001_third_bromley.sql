-- 手写：0000 是人工写的迁移、没有留 snapshot，drizzle-kit 因此拿不到基线，
-- 生成的是整份 CREATE TABLE（在已有库上必然报 table already exists）。
-- 这里只保留真正的增量；随本次生成的 0001_snapshot.json 已是完整基线，
-- 之后再改 schema 就能正常 diff 了。
ALTER TABLE `campus_recruit_applications` ADD `apply_email` text;--> statement-breakpoint
ALTER TABLE `campus_recruit_applications` ADD `apply_phone` text;
