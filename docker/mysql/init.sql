CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  domain VARCHAR(180) NOT NULL,
  description TEXT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  whatsapp_enabled TINYINT(1) NOT NULL DEFAULT 1,
  whatsapp_phone VARCHAR(64) NULL,
  prompt_guardrails TEXT NULL,
  created_by_admin_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bots_admin
    FOREIGN KEY (created_by_admin_id) REFERENCES admins(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bot_sources (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  bot_id INT NOT NULL,
  source_type ENUM('text', 'pdf', 'api') NOT NULL,
  title VARCHAR(190) NOT NULL,
  content_text LONGTEXT NULL,
  file_path VARCHAR(512) NULL,
  api_url VARCHAR(512) NULL,
  api_method VARCHAR(16) NULL,
  api_headers_json LONGTEXT NULL,
  api_mapping_json LONGTEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('pending', 'processed', 'error') NOT NULL DEFAULT 'pending',
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bot_sources_bot (bot_id),
  CONSTRAINT fk_bot_sources_bot
    FOREIGN KEY (bot_id) REFERENCES bots(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_whatsapp_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  bot_id INT NOT NULL,
  session_name VARCHAR(180) NOT NULL UNIQUE,
  session_status ENUM('disconnected', 'initializing', 'qr_ready', 'connected', 'error')
    NOT NULL DEFAULT 'disconnected',
  qr_code_data LONGTEXT NULL,
  phone_number VARCHAR(64) NULL,
  last_connected_at DATETIME NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bot_session_bot (bot_id),
  CONSTRAINT fk_bot_whatsapp_sessions_bot
    FOREIGN KEY (bot_id) REFERENCES bots(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_conversations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  bot_id INT NOT NULL,
  contact_phone VARCHAR(64) NOT NULL,
  contact_name VARCHAR(160) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bot_contact (bot_id, contact_phone),
  INDEX idx_bot_conversations_bot (bot_id),
  CONSTRAINT fk_bot_conversations_bot
    FOREIGN KEY (bot_id) REFERENCES bots(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  bot_id INT NOT NULL,
  sender_type ENUM('user', 'bot', 'system') NOT NULL,
  message_text LONGTEXT NOT NULL,
  message_type ENUM('text', 'image', 'document') NOT NULL DEFAULT 'text',
  wa_message_id VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bot_messages_conv (conversation_id),
  INDEX idx_bot_messages_bot (bot_id),
  CONSTRAINT fk_bot_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES bot_conversations(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_messages_bot
    FOREIGN KEY (bot_id) REFERENCES bots(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_knowledge_chunks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  bot_id INT NOT NULL,
  source_id BIGINT NOT NULL,
  chunk_text LONGTEXT NOT NULL,
  chunk_index INT NOT NULL,
  metadata_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bot_chunks_bot (bot_id),
  INDEX idx_bot_chunks_source (source_id),
  CONSTRAINT fk_bot_chunks_bot
    FOREIGN KEY (bot_id) REFERENCES bots(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_chunks_source
    FOREIGN KEY (source_id) REFERENCES bot_sources(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bot_api_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  bot_id INT NOT NULL,
  source_id BIGINT NULL,
  request_summary TEXT NULL,
  response_summary TEXT NULL,
  status_code INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bot_api_logs_bot (bot_id),
  INDEX idx_bot_api_logs_source (source_id),
  CONSTRAINT fk_bot_api_logs_bot
    FOREIGN KEY (bot_id) REFERENCES bots(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bot_api_logs_source
    FOREIGN KEY (source_id) REFERENCES bot_sources(id)
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bot_suggestions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  bot_id INT NOT NULL,
  question_text VARCHAR(500) NOT NULL,
  category VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bot_suggestions_bot (bot_id),
  CONSTRAINT fk_bot_suggestions_bot
    FOREIGN KEY (bot_id) REFERENCES bots(id)
    ON DELETE CASCADE
);

INSERT INTO admins (full_name, email, password_hash, role)
SELECT 'Admin Marsa', 'admin@marsa.ma', 'Admin1234', 'super_admin'
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE email = 'admin@marsa.ma');
