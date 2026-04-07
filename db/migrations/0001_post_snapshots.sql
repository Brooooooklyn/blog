CREATE TABLE `post_snapshots` (
	`postname` text PRIMARY KEY NOT NULL,
	`snapshot` blob NOT NULL,
	`updated_at` integer NOT NULL
);
