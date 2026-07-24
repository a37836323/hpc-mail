CREATE TABLE `rate_counters` (
	`scope` text NOT NULL,
	`subject` text NOT NULL,
	`window` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`units` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`scope`, `subject`, `window`)
);
