CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS authorized_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NULL,
  phone_number VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  qr_token VARCHAR(128) NULL,
  qr_expires_at DATETIME NULL,
  added_by_admin_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_authorized_users_phone (phone_number),
  UNIQUE KEY uq_authorized_users_email (email)
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  authorized_user_id INT NOT NULL,
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

CREATE TABLE IF NOT EXISTS questions_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  authorized_user_id INT NULL,
  session_id VARCHAR(64) NULL,
  question TEXT NULL,
  answer TEXT NULL,
  qr_token VARCHAR(128) NULL,
  ip_address VARCHAR(64) NULL,
  status VARCHAR(32) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qh_user (authorized_user_id),
  INDEX idx_qh_session (session_id),
  INDEX idx_qh_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS user_mobile_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  authorized_user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ums_token (token),
  INDEX idx_ums_user (authorized_user_id),
  CONSTRAINT fk_ums_au
    FOREIGN KEY (authorized_user_id) REFERENCES authorized_users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qr_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
  authorized_user_id INT NOT NULL,
  expected_phone VARCHAR(32) NULL,
  user_id INT NULL,
  chat_session_token VARCHAR(128) NULL,
  chat_session_id VARCHAR(64) NULL,
  chat_expires_at DATETIME NULL,
  credential_delivered_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  UNIQUE KEY uq_qs_token (token),
  INDEX idx_qs_status_exp (status, expires_at),
  CONSTRAINT fk_qs_au
    FOREIGN KEY (authorized_user_id) REFERENCES authorized_users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_bindings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  authorized_user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_device_binding_token (token),
  INDEX idx_device_binding_user (authorized_user_id),
  CONSTRAINT fk_device_binding_user
    FOREIGN KEY (authorized_user_id) REFERENCES authorized_users(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qr_phone_otp_challenges (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  qr_session_id BIGINT NOT NULL,
  otp_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verify_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_qpot_qs (qr_session_id),
  CONSTRAINT fk_qpot_qs
    FOREIGN KEY (qr_session_id) REFERENCES qr_sessions(id)
    ON DELETE CASCADE
);
