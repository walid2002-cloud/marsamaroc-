-- Liaison appareil ↔ utilisateur (jeton longue durée). Permet d’ouvrir un QR sans saisie après
-- une connexion unique sur ce navigateur / ce téléphone.
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
