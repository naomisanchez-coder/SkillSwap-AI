-- SkillSwap AI: 004_password_recovery. Preparada, NO aplicada.
-- Requiere 001-003 validadas. No almacena correo, IP ni codigo en claro.
SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE password_recovery_limits (
  scope VARCHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  identifier_hmac VARBINARY(32) NOT NULL,
  window_started_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  last_admitted_at DATETIME(6) NULL,
  admissions SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (scope, identifier_hmac),
  KEY ix_password_recovery_limit_expiry (expires_at),
  CONSTRAINT chk_password_recovery_limit_scope CHECK (scope IN ('EMAIL', 'IP')),
  CONSTRAINT chk_password_recovery_limit_hmac CHECK (OCTET_LENGTH(identifier_hmac) = 32),
  CONSTRAINT chk_password_recovery_limit_window CHECK (expires_at = window_started_at + INTERVAL 1 HOUR),
  CONSTRAINT chk_password_recovery_limit_count CHECK (
    admissions <= CASE scope WHEN 'EMAIL' THEN 5 WHEN 'IP' THEN 20 END
  ),
  CONSTRAINT chk_password_recovery_limit_last CHECK (
    (admissions = 0 AND last_admitted_at IS NULL) OR
    (admissions > 0 AND last_admitted_at >= window_started_at AND last_admitted_at < expires_at)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE password_recovery_challenges (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code_hmac VARBINARY(32) NOT NULL,
  hmac_key_version VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'SENDING',
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  expires_at DATETIME(6) NOT NULL,
  consumed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_recovery_id_user (id, user_id),
  KEY ix_password_recovery_user_status (user_id, status),
  KEY ix_password_recovery_expiry (expires_at),
  CONSTRAINT fk_password_recovery_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_password_recovery_hmac CHECK (
    OCTET_LENGTH(code_hmac) = 32 AND CHAR_LENGTH(TRIM(hmac_key_version)) > 0
  ),
  CONSTRAINT chk_password_recovery_status CHECK (
    status IN ('SENDING', 'PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED', 'EXHAUSTED')
  ),
  CONSTRAINT chk_password_recovery_attempts CHECK (max_attempts = 5 AND attempts <= max_attempts),
  CONSTRAINT chk_password_recovery_exhausted CHECK (status <> 'EXHAUSTED' OR attempts = max_attempts),
  CONSTRAINT chk_password_recovery_dates CHECK (
    expires_at > created_at AND
    (consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at <= expires_at))
  ),
  CONSTRAINT chk_password_recovery_consumed CHECK (
    (status = 'CONSUMED' AND consumed_at IS NOT NULL) OR
    (status <> 'CONSUMED' AND consumed_at IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (version, checksum)
VALUES (@skillswap_migration_version, @skillswap_migration_checksum);
