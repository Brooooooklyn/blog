CREATE TABLE `inline_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postname` text NOT NULL,
	`lang` text NOT NULL DEFAULT 'en',
	`block_index` integer NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`selected_text` text NOT NULL,
	`cursor_start` blob,
	`cursor_end` blob,
	`version_frontiers` blob,
	`parent_id` integer,
	`github_user_id` text NOT NULL,
	`github_username` text NOT NULL,
	`github_avatar_url` text NOT NULL,
	`github_display_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
