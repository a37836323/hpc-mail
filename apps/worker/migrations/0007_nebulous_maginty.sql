CREATE TABLE `draft_attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`r2_key` text NOT NULL,
	`upload_id` text,
	`parts` text,
	`status` text DEFAULT 'uploading' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_attachments_token_unique` ON `draft_attachments` (`token`);--> statement-breakpoint
CREATE INDEX `idx_draft_user` ON `draft_attachments` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_draft_status` ON `draft_attachments` (`status`,`created_at`);