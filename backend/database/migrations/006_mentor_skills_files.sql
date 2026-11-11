-- SkillSwap AI: 006_mentor_skills_files. Preparada, NO aplicada.
-- Catálogo, habilidades declaradas, solicitudes de mentor y archivos privados.
SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE skill_catalog (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_skill_catalog_code (code),
  UNIQUE KEY uq_skill_catalog_name (name),
  KEY ix_skill_catalog_active_name (is_active, name),
  CONSTRAINT chk_skill_catalog_code CHECK (REGEXP_LIKE(code, '^[a-z0-9]+(?:-[a-z0-9]+)*$', 'c')),
  CONSTRAINT chk_skill_catalog_name CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 2 AND 120),
  CONSTRAINT chk_skill_catalog_category CHECK (category IS NULL OR CHAR_LENGTH(TRIM(category)) BETWEEN 2 AND 100),
  CONSTRAINT chk_skill_catalog_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE student_skills (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  skill_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  intent VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, skill_id, intent),
  KEY ix_student_skills_skill_intent (skill_id, intent),
  CONSTRAINT fk_student_skills_profile FOREIGN KEY (user_id) REFERENCES student_profiles (user_id),
  CONSTRAINT fk_student_skills_catalog FOREIGN KEY (skill_id) REFERENCES skill_catalog (id),
  CONSTRAINT chk_student_skills_intent CHECK (intent IN ('LEARN', 'TEACH'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE private_files (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  purpose VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  storage_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  media_type VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  sha256 VARBINARY(32) NOT NULL,
  status VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'READY',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_private_files_storage (storage_key),
  KEY ix_private_files_owner_purpose (owner_user_id, purpose, status),
  CONSTRAINT fk_private_files_owner FOREIGN KEY (owner_user_id) REFERENCES users (id),
  CONSTRAINT chk_private_files_purpose CHECK (purpose IN ('PROFILE_PHOTO', 'MENTOR_CERTIFICATE', 'MENTOR_PORTFOLIO')),
  CONSTRAINT chk_private_files_storage CHECK (REGEXP_LIKE(storage_key, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT chk_private_files_hash CHECK (OCTET_LENGTH(sha256) = 32),
  CONSTRAINT chk_private_files_status CHECK (status IN ('READY', 'DELETED')),
  CONSTRAINT chk_private_files_dates CHECK ((status = 'READY' AND deleted_at IS NULL) OR (status = 'DELETED' AND deleted_at IS NOT NULL)),
  CONSTRAINT chk_private_files_size CHECK (
    (purpose = 'PROFILE_PHOTO' AND size_bytes BETWEEN 1 AND 2097152 AND media_type IN ('image/jpeg', 'image/png', 'image/webp')) OR
    (purpose IN ('MENTOR_CERTIFICATE', 'MENTOR_PORTFOLIO') AND size_bytes BETWEEN 1 AND 5242880 AND media_type = 'application/pdf')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE student_profile_photos (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_student_profile_photo_file (file_id),
  CONSTRAINT fk_student_profile_photo_profile FOREIGN KEY (user_id) REFERENCES student_profiles (user_id),
  CONSTRAINT fk_student_profile_photo_file FOREIGN KEY (file_id) REFERENCES private_files (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE mentor_applications (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  skill_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING',
  portfolio_url VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin NULL,
  submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  decided_at DATETIME(6) NULL,
  decided_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  decision_notes VARCHAR(1000) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mentor_application_user_skill (user_id, skill_id),
  KEY ix_mentor_applications_status_submitted (status, submitted_at),
  KEY ix_mentor_applications_decider (decided_by, decided_at),
  CONSTRAINT fk_mentor_application_profile FOREIGN KEY (user_id) REFERENCES student_profiles (user_id),
  CONSTRAINT fk_mentor_application_skill FOREIGN KEY (skill_id) REFERENCES skill_catalog (id),
  CONSTRAINT fk_mentor_application_decider FOREIGN KEY (decided_by) REFERENCES users (id),
  CONSTRAINT chk_mentor_application_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT chk_mentor_application_portfolio CHECK (portfolio_url IS NULL OR CHAR_LENGTH(portfolio_url) BETWEEN 8 AND 2048),
  CONSTRAINT chk_mentor_application_decision CHECK (
    (status = 'PENDING' AND decided_at IS NULL AND decided_by IS NULL AND decision_notes IS NULL) OR
    (status IN ('APPROVED', 'REJECTED') AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE mentor_application_documents (
  application_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  document_type VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (application_id, document_type),
  UNIQUE KEY uq_mentor_application_document_file (file_id),
  CONSTRAINT fk_mentor_document_application FOREIGN KEY (application_id) REFERENCES mentor_applications (id),
  CONSTRAINT fk_mentor_document_file FOREIGN KEY (file_id) REFERENCES private_files (id),
  CONSTRAINT chk_mentor_document_type CHECK (document_type IN ('CERTIFICATE', 'PORTFOLIO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE mentor_application_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  application_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_type VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  from_status VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NULL,
  to_status VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NULL,
  notes VARCHAR(1000) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY ix_mentor_events_application_created (application_id, created_at),
  KEY ix_mentor_events_actor_created (actor_user_id, created_at),
  CONSTRAINT fk_mentor_event_application FOREIGN KEY (application_id) REFERENCES mentor_applications (id),
  CONSTRAINT fk_mentor_event_actor FOREIGN KEY (actor_user_id) REFERENCES users (id),
  CONSTRAINT chk_mentor_event_type CHECK (event_type IN ('SUBMITTED', 'RESUBMITTED', 'CERTIFICATE_REPLACED', 'PORTFOLIO_UPDATED', 'APPROVED', 'REJECTED')),
  CONSTRAINT chk_mentor_event_statuses CHECK (
    (from_status IS NULL OR from_status IN ('PENDING', 'APPROVED', 'REJECTED')) AND
    (to_status IS NULL OR to_status IN ('PENDING', 'APPROVED', 'REJECTED'))
  ),
  CONSTRAINT chk_mentor_event_notes CHECK (notes IS NULL OR CHAR_LENGTH(TRIM(notes)) BETWEEN 1 AND 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (version, checksum)
VALUES (@skillswap_migration_version, @skillswap_migration_checksum);
