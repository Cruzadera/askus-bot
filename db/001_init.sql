CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  closed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS votes (
  id SERIAL PRIMARY KEY,
  poll_id INT REFERENCES polls(id) ON DELETE CASCADE,
  user_hash TEXT NOT NULL,
  option TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE (poll_id, user_hash)
);
