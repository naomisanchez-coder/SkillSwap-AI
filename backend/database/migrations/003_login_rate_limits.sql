-- SkillSwap AI: 003_login_rate_limits. Preparada, NO aplicada.
-- Requiere historial 001 y 002 validado. No almacena correos ni direcciones IP en claro.
-- La aplicación reserva todos los intentos admitidos antes de consultar credenciales.
-- La ventana es fija: nuevos intentos limitados no desplazan expires_at.
SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE login_rate_limits (
  scope VARCHAR(5) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  identifier_hmac VARBINARY(32) NOT NULL,
  window_started_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (scope, identifier_hmac),
  KEY ix_login_rate_expiry (expires_at),
  CONSTRAINT chk_login_rate_scope CHECK (scope IN ('EMAIL', 'IP')),
  CONSTRAINT chk_login_rate_hmac CHECK (OCTET_LENGTH(identifier_hmac) = 32),
  CONSTRAINT chk_login_rate_attempts CHECK (attempts BETWEEN 0 AND 20),
  CONSTRAINT chk_login_rate_window CHECK (expires_at = window_started_at + INTERVAL 15 MINUTE)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (version, checksum)
VALUES (@skillswap_migration_version, @skillswap_migration_checksum);
