CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

ALTER TABLE campaigns ADD COLUMN audience_type TEXT NOT NULL DEFAULT 'all' CHECK (audience_type IN ('all', 'group', 'person'));
ALTER TABLE campaigns ADD COLUMN audience_id TEXT;

CREATE TABLE IF NOT EXISTS campaign_recipients (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_user ON campaign_recipients(user_id);

INSERT OR IGNORE INTO campaign_recipients(campaign_id,user_id)
SELECT c.id,u.id FROM campaigns c CROSS JOIN users u WHERE u.role='employee';

CREATE TABLE IF NOT EXISTS coupon_deliveries (
  campaign_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  code_ciphertext TEXT NOT NULL,
  code_iv TEXT NOT NULL,
  sent_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, user_id),
  FOREIGN KEY (campaign_id, user_id) REFERENCES campaign_recipients(campaign_id, user_id)
);
