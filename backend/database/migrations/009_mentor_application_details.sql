-- SkillSwap AI: 009_mentor_application_details. Preparada, NO aplicada automáticamente.
-- Declaraciones del estudiante, independientes del aprendizaje y del nivel aprobado por ADMIN.
SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE mentor_application_details (
  application_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  declared_level VARCHAR(20) NOT NULL,
  experience VARCHAR(2000) NOT NULL,
  topics VARCHAR(2000) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (application_id),
  CONSTRAINT fk_mentor_application_details_application FOREIGN KEY (application_id) REFERENCES mentor_applications (id),
  CONSTRAINT chk_mentor_declared_level CHECK (declared_level IN ('Intermedio', 'Avanzado')),
  CONSTRAINT chk_mentor_experience CHECK (CHAR_LENGTH(TRIM(experience)) BETWEEN 1 AND 2000),
  CONSTRAINT chk_mentor_topics CHECK (CHAR_LENGTH(TRIM(topics)) BETWEEN 1 AND 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (version, checksum)
VALUES (@skillswap_migration_version, @skillswap_migration_checksum);
