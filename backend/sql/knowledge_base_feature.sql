CREATE TABLE IF NOT EXISTS knowledge_sources (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  type_source ENUM('document', 'text', 'api') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  original_content LONGTEXT NULL,
  processed_content LONGTEXT NULL,
  file_name VARCHAR(255) NULL,
  file_path VARCHAR(500) NULL,
  api_url VARCHAR(500) NULL,
  api_method VARCHAR(16) NULL DEFAULT 'GET',
  api_headers JSON NULL,
  api_body LONGTEXT NULL,
  status ENUM('pending', 'processed', 'error') NOT NULL DEFAULT 'pending',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  processed_at DATETIME NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ks_type (type_source),
  INDEX idx_ks_status_active (status, is_active),
  INDEX idx_ks_updated_at (updated_at)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_id BIGINT NOT NULL,
  chunk_index INT NOT NULL,
  chunk_text LONGTEXT NOT NULL,
  token_count_estimate INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_kc_source (source_id),
  INDEX idx_kc_source_chunk (source_id, chunk_index),
  FULLTEXT KEY ft_kc_text (chunk_text),
  CONSTRAINT fk_kc_source
    FOREIGN KEY (source_id) REFERENCES knowledge_sources(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions_history_sources (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  question_history_id INT NOT NULL,
  knowledge_source_id BIGINT NOT NULL,
  source_title VARCHAR(255) NULL,
  relevance_score DECIMAL(8,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qhs_qh (question_history_id),
  INDEX idx_qhs_source (knowledge_source_id)
);
