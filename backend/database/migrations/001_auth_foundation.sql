-- SkillSwap AI: 001_auth_foundation. MySQL 8.4 / InnoDB.
-- Ejecutar solo con cuenta de migraciones en un esquema inspeccionado y vacio.
-- El ejecutor debe adquirir GET_LOCK, comprobar SHA-256 y detenerse al primer error.
-- No usar --force ni IF NOT EXISTS: un objeto previo exige revision humana.
-- DDL tiene commits implicitos; un fallo puede dejar tablas parciales.
-- @skillswap_migration_checksum debe ser SHA-256 hexadecimal del archivo completo.
-- @skillswap_migration_version debe ser exactamente 001_auth_foundation.
-- No se crean esquemas, usuarios, privilegios, catalogos ni datos de negocio.

SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE schema_migrations (
  version VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (version),
  CONSTRAINT chk_migrations_version CHECK (REGEXP_LIKE(version, '^[0-9]{3}_[a-z0-9_]+$', 'c')),
  CONSTRAINT chk_migrations_checksum CHECK (REGEXP_LIKE(checksum, '^[0-9a-f]{64}$', 'c'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE careers (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_careers_code (code),
  CONSTRAINT chk_careers_active CHECK (is_active IN (0, 1)),
  CONSTRAINT chk_careers_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_careers_code CHECK (CHAR_LENGTH(TRIM(code)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Catalogo normalizado de ciclos autorizados por carrera, sin datos iniciales.
CREATE TABLE career_cycles (
  career_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cycle SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (career_id, cycle),
  CONSTRAINT fk_cycles_career FOREIGN KEY (career_id) REFERENCES careers (id),
  CONSTRAINT chk_cycles_positive CHECK (cycle > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'STUDENT',
  status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING_VERIFICATION',
  email_verified_at DATETIME(6) NULL,
  terms_accepted_at DATETIME(6) NULL,
  terms_version VARCHAR(100) NULL,
  privacy_version VARCHAR(100) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_id_role (id, role),
  KEY ix_users_status (status),
  CONSTRAINT chk_users_names CHECK (CHAR_LENGTH(TRIM(first_name)) BETWEEN 2 AND 100 AND CHAR_LENGTH(TRIM(last_name)) BETWEEN 2 AND 100),
  CONSTRAINT chk_users_role CHECK (role IN ('STUDENT', 'ADMIN')),
  CONSTRAINT chk_users_status CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED')),
  CONSTRAINT chk_users_email_normalized CHECK (
    BINARY email = BINARY LOWER(TRIM(email)) AND
    REGEXP_LIKE(email, '^[^[:space:]@]+@[^[:space:]@]+$', 'c')
  ),
  -- Invariantes confirmadas; la gramatica institucional completa se validara en servicio.
  CONSTRAINT chk_users_student_email CHECK (role <> 'STUDENT' OR (
    SUBSTRING_INDEX(email, '@', -1) = 'tecsup.edu.pe' AND
    LOCATE('.', SUBSTRING_INDEX(email, '@', 1)) > 1 AND
    RIGHT(SUBSTRING_INDEX(email, '@', 1), 1) <> '.' AND
    LOCATE('..', SUBSTRING_INDEX(email, '@', 1)) = 0 AND
    LOCATE('+', email) = 0
  )),
  CONSTRAINT chk_users_password_hash CHECK (
    LEFT(password_hash, 1) = '$' AND CHAR_LENGTH(password_hash) >= 40
  ),
  CONSTRAINT chk_users_active_verified CHECK (status <> 'ACTIVE' OR email_verified_at IS NOT NULL),
  CONSTRAINT chk_users_verification_date CHECK (email_verified_at IS NULL OR email_verified_at >= created_at),
  CONSTRAINT chk_users_legal CHECK (
    (terms_accepted_at IS NULL AND terms_version IS NULL AND privacy_version IS NULL) OR
    (terms_accepted_at IS NOT NULL AND terms_version IS NOT NULL AND privacy_version IS NOT NULL AND
      CHAR_LENGTH(TRIM(terms_version)) > 0 AND CHAR_LENGTH(TRIM(privacy_version)) > 0)
  ),
  CONSTRAINT chk_users_student_legal CHECK (role <> 'STUDENT' OR terms_accepted_at IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE student_profiles (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_role VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'STUDENT',
  career_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  cycle SMALLINT UNSIGNED NOT NULL,
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  KEY ix_profiles_user_role (user_id, user_role),
  KEY ix_profiles_career_cycle (career_id, cycle),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id, user_role) REFERENCES users (id, role),
  CONSTRAINT fk_profiles_career_cycle FOREIGN KEY (career_id, cycle) REFERENCES career_cycles (career_id, cycle),
  CONSTRAINT chk_profiles_student CHECK (user_role = 'STUDENT'),
  CONSTRAINT chk_profiles_onboarding CHECK (onboarding_complete IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE email_verifications (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code_hmac VARBINARY(32) NOT NULL,
  hmac_key_version VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'PENDING',
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts SMALLINT UNSIGNED NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  consumed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_verifications_id_user (id, user_id),
  KEY ix_verifications_user_status (user_id, status),
  KEY ix_verifications_expiry (expires_at),
  CONSTRAINT fk_verifications_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_verifications_hmac CHECK (OCTET_LENGTH(code_hmac) = 32 AND CHAR_LENGTH(TRIM(hmac_key_version)) > 0),
  CONSTRAINT chk_verifications_status CHECK (status IN ('PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED', 'EXHAUSTED')),
  CONSTRAINT chk_verifications_attempts CHECK (max_attempts > 0 AND attempts <= max_attempts),
  CONSTRAINT chk_verifications_exhausted CHECK (status <> 'EXHAUSTED' OR attempts = max_attempts),
  CONSTRAINT chk_verifications_dates CHECK (expires_at > created_at AND (consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at <= expires_at))),
  CONSTRAINT chk_verifications_consumed CHECK (
    (status = 'CONSUMED' AND consumed_at IS NOT NULL) OR (status <> 'CONSUMED' AND consumed_at IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auth_sessions (
  -- Digest SHA-256 del identificador opaco de alta entropia; no la cookie en claro.
  id_hash VARBINARY(32) NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  csrf_token_hmac VARBINARY(32) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_seen_at DATETIME(6) NOT NULL,
  idle_expires_at DATETIME(6) NOT NULL,
  absolute_expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  remember BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id_hash),
  KEY ix_sessions_user_revoked (user_id, revoked_at),
  KEY ix_sessions_idle_expiry (idle_expires_at),
  KEY ix_sessions_absolute_expiry (absolute_expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_sessions_hashes CHECK (OCTET_LENGTH(id_hash) = 32 AND OCTET_LENGTH(csrf_token_hmac) = 32),
  CONSTRAINT chk_sessions_dates CHECK (
    last_seen_at >= created_at AND idle_expires_at > last_seen_at AND
    absolute_expires_at >= idle_expires_at AND
    (revoked_at IS NULL OR revoked_at >= created_at)
  ),
  CONSTRAINT chk_sessions_remember CHECK (remember IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE credit_transactions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  amount INT NOT NULL,
  reason VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  operation_reference VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  verification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  -- NULL para otros movimientos: UNIQUE solo limita la concesion inicial por usuario.
  initial_grant_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (CASE WHEN reason = 'INITIAL_EMAIL_VERIFICATION' THEN user_id ELSE NULL END) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_credit_operation (operation_reference),
  UNIQUE KEY uq_credit_initial_grant (initial_grant_user_id),
  KEY ix_credit_user_created (user_id, created_at),
  KEY ix_credit_verification_user (verification_id, user_id),
  CONSTRAINT fk_credit_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_credit_verification FOREIGN KEY (verification_id, user_id) REFERENCES email_verifications (id, user_id),
  CONSTRAINT chk_credit_amount CHECK (amount <> 0),
  CONSTRAINT chk_credit_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0),
  CONSTRAINT chk_credit_reference CHECK (CHAR_LENGTH(TRIM(operation_reference)) > 0),
  CONSTRAINT chk_credit_initial_amount CHECK (reason <> 'INITIAL_EMAIL_VERIFICATION' OR (amount = 20 AND verification_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Unico INSERT de la migracion: historial tecnico, nunca cuentas o creditos.
-- El ejecutor calcula el checksum sobre los bytes originales, sin sustituir este archivo.
INSERT INTO schema_migrations (version, checksum)
VALUES (@skillswap_migration_version, @skillswap_migration_checksum);
