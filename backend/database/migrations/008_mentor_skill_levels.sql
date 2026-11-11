-- SkillSwap AI: 008_mentor_skill_levels. Preparada, NO aplicada.
-- Catálogo administrado de niveles y nivel de dominio por oferta aprobada, sin semillas inventadas.
SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE skill_level_catalog (
  code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(80) NOT NULL,
  rank_value SMALLINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (code),
  UNIQUE KEY uq_skill_level_name (name),
  UNIQUE KEY uq_skill_level_rank (rank_value),
  KEY ix_skill_level_active_rank (is_active, rank_value),
  CONSTRAINT chk_skill_level_code CHECK (REGEXP_LIKE(code, '^[a-z0-9]+(?:-[a-z0-9]+)*$', 'c')),
  CONSTRAINT chk_skill_level_name CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 2 AND 80),
  CONSTRAINT chk_skill_level_rank CHECK (rank_value BETWEEN 1 AND 100),
  CONSTRAINT chk_skill_level_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE mentor_skill_levels (
  offer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  level_code VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  assigned_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (offer_id),
  KEY ix_mentor_skill_levels_level (level_code, offer_id),
  KEY ix_mentor_skill_levels_actor (assigned_by, assigned_at),
  CONSTRAINT fk_mentor_skill_level_offer FOREIGN KEY (offer_id) REFERENCES mentor_offers (id),
  CONSTRAINT fk_mentor_skill_level_catalog FOREIGN KEY (level_code) REFERENCES skill_level_catalog (code),
  CONSTRAINT fk_mentor_skill_level_actor FOREIGN KEY (assigned_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (version, checksum)
VALUES (@skillswap_migration_version, @skillswap_migration_checksum);
