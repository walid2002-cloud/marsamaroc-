-- Sessions mobiles (Bearer) après login utilisateur — requises pour valider un QR sans saisir le numéro.
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

-- Session de pairing QR : le scan mobile (utilisateur déjà connecté) approuve ou refuse selon le numéro.
CREATE TABLE IF NOT EXISTS qr_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
  authorized_user_id INT NOT NULL,
  expected_phone VARCHAR(32) NULL,
  user_id INT NULL COMMENT 'Même que authorized_user_id une fois approuvé',
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
