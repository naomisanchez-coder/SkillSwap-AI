-- SkillSwap AI: 005_student_profile. Preparada, NO aplicada.
-- Amplia el perfil estudiantil sin modificar las migraciones 001-004.
SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE student_profile_details (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  bio VARCHAR(500) NULL,
  learning_level VARCHAR(30) NULL,
  learning_goals VARCHAR(1000) NULL,
  preferred_schedule VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_profile_details_student FOREIGN KEY (user_id) REFERENCES student_profiles (user_id),
  CONSTRAINT chk_profile_details_bio CHECK (bio IS NULL OR CHAR_LENGTH(TRIM(bio)) BETWEEN 1 AND 500),
  CONSTRAINT chk_profile_details_level CHECK (learning_level IS NULL OR CHAR_LENGTH(TRIM(learning_level)) BETWEEN 2 AND 30),
  CONSTRAINT chk_profile_details_goals CHECK (learning_goals IS NULL OR CHAR_LENGTH(TRIM(learning_goals)) BETWEEN 1 AND 1000),
  CONSTRAINT chk_profile_details_schedule CHECK (preferred_schedule IS NULL OR CHAR_LENGTH(TRIM(preferred_schedule)) BETWEEN 2 AND 500)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE student_interests (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  interest VARCHAR(100) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, position),
  UNIQUE KEY uq_student_interest (user_id, interest),
  CONSTRAINT fk_student_interests_profile FOREIGN KEY (user_id) REFERENCES student_profiles (user_id),
  CONSTRAINT chk_student_interest_position CHECK (position BETWEEN 1 AND 10),
  CONSTRAINT chk_student_interest_value CHECK (CHAR_LENGTH(TRIM(interest)) BETWEEN 2 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (version, checksum)
VALUES (@skillswap_migration_version, @skillswap_migration_checksum);
