CREATE TABLE IF NOT EXISTS views (
  postname TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  postname TEXT NOT NULL,
  github_user_id TEXT NOT NULL,
  github_username TEXT NOT NULL,
  github_avatar_url TEXT NOT NULL,
  github_display_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_comments_postname ON comments(postname);
