CREATE TABLE `stars` (
	`user_id` integer NOT NULL,
	`message_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `message_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_stars_message` ON `stars` (`message_id`);