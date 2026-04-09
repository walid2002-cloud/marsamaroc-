-- 1) authorized_users: QR token et expiration
ALTER TABLE authorized_users
  ADD COLUMN IF NOT EXISTS qr_token VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS qr_expires_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS email VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;

ALTER TABLE authorized_users
  ADD UNIQUE INDEX IF NOT EXISTS uq_authorized_users_email (email);

-- 2) chat_sessions: sessions utilisateur après scan QR
CREATE TABLE IF NOT EXISTS chat_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  authorized_user_id BIGINT NOT NULL,
  session_id VARCHAR(64) NOT NULL UNIQUE,
  session_token VARCHAR(128) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_chat_sessions_user (authorized_user_id),
  INDEX idx_chat_sessions_token (session_token),
  CONSTRAINT fk_chat_sessions_authorized_users
    FOREIGN KEY (authorized_user_id) REFERENCES authorized_users(id)
    ON DELETE CASCADE
);

-- 3) questions_history: colonnes minimales pour relier user/session
ALTER TABLE questions_history
  ADD COLUMN IF NOT EXISTS authorized_user_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS question TEXT NULL,
  ADD COLUMN IF NOT EXISTS answer TEXT NULL,
  ADD COLUMN IF NOT EXISTS qr_token VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE questions_history
  ADD INDEX IF NOT EXISTS idx_qh_user (authorized_user_id),
  ADD INDEX IF NOT EXISTS idx_qh_session (session_id),
  ADD INDEX IF NOT EXISTS idx_qh_created_at (created_at);
