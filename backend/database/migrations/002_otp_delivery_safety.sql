-- SkillSwap AI: 002_otp_delivery_safety. Preparada, NO aplicada.
-- Requiere 001 validada. CREATE/ALTER tienen commits implicitos.
-- Ante fallo parcial: detenerse, conservar objetos y revisar sin limpiar/reintentar.
SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- No correo, IP, OTP ni clave en claro. Cinco timestamps acotan la ventana movil.
CREATE TABLE otp_request_limits (
  email_hmac VARBINARY(32) NOT NULL,
  request_1_at DATETIME(6) NULL,
  request_2_at DATETIME(6) NULL,
  request_3_at DATETIME(6) NULL,
  request_4_at DATETIME(6) NULL,
  request_5_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (email_hmac),
  CONSTRAINT chk_otp_limits_hmac CHECK (OCTET_LENGTH(email_hmac) = 32),
  CONSTRAINT chk_otp_limits_order CHECK (
    (request_2_at IS NULL OR (request_1_at IS NOT NULL AND request_2_at >= request_1_at)) AND
    (request_3_at IS NULL OR (request_2_at IS NOT NULL AND request_3_at >= request_2_at)) AND
    (request_4_at IS NULL OR (request_3_at IS NOT NULL AND request_4_at >= request_3_at)) AND
    (request_5_at IS NULL OR (request_4_at IS NOT NULL AND request_5_at >= request_4_at))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una sola sentencia atomica cambia CHECK y default; no elimina filas ni columnas.
ALTER TABLE email_verifications
  DROP CHECK chk_verifications_status,
  ADD CONSTRAINT chk_verifications_status CHECK (status IN ('SENDING', 'PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED', 'EXHAUSTED')),
  ALTER COLUMN status SET DEFAULT 'SENDING';

INSERT INTO schema_migrations (version, checksum)
VALUES (@skillswap_migration_version, @skillswap_migration_checksum);
