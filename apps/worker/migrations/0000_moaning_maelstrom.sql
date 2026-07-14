CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_suffix` text NOT NULL,
	`key_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	`scopes` text NOT NULL,
	`allowed_ips` text NOT NULL,
	`rate_limit` integer DEFAULT 120 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer,
	`last_used_at` integer,
	`last_used_ip` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_user` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `api_rate_limits` (
	`api_key_id` integer NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`api_key_id`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `api_request_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`api_key_id` integer NOT NULL,
	`request_id` text DEFAULT '' NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status_code` integer NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_api_logs_key` ON `api_request_logs` (`api_key_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_api_logs_created` ON `api_request_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` integer NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text DEFAULT 'download' NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`content_id` text DEFAULT '' NOT NULL,
	`disposition` text DEFAULT 'attachment' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_message` ON `attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_code_unique` ON `invites` (`code`);--> statement-breakpoint
CREATE TABLE `mailboxes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`domain` text NOT NULL,
	`user_id` integer NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailboxes_address_unique` ON `mailboxes` (`address`);--> statement-breakpoint
CREATE INDEX `idx_mailboxes_user` ON `mailboxes` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_mailboxes_domain` ON `mailboxes` (`domain`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`direction` text NOT NULL,
	`address` text NOT NULL,
	`domain` text NOT NULL,
	`from_address` text DEFAULT '' NOT NULL,
	`from_name` text DEFAULT '' NOT NULL,
	`recipients` text DEFAULT '{"to":[],"cc":[],"bcc":[]}' NOT NULL,
	`subject` text DEFAULT '' NOT NULL,
	`preview` text DEFAULT '' NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`body_html` text DEFAULT '' NOT NULL,
	`body_r2_key` text,
	`verification_code` text DEFAULT '' NOT NULL,
	`message_id` text,
	`in_reply_to` text,
	`status` text NOT NULL,
	`send_channel` text DEFAULT '' NOT NULL,
	`resend_id` text,
	`error_detail` text DEFAULT '' NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_messages_address` ON `messages` (`address`,`id`);--> statement-breakpoint
CREATE INDEX `idx_messages_domain` ON `messages` (`domain`,`id`);--> statement-breakpoint
CREATE INDEX `idx_messages_direction` ON `messages` (`direction`,`id`);--> statement-breakpoint
CREATE INDEX `idx_messages_resend` ON `messages` (`resend_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`invite_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_login_at` integer,
	`last_login_ip` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);