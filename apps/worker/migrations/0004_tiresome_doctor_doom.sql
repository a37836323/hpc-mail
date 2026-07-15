ALTER TABLE `messages` ADD `raw_r2_key` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `idx_messages_deleted` ON `messages` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_recovery_codes` text;