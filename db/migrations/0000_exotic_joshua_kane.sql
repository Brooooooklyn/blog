CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postname` text NOT NULL,
	`github_user_id` text NOT NULL,
	`github_username` text NOT NULL,
	`github_avatar_url` text NOT NULL,
	`github_display_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `views` (
	`postname` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
