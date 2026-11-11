-- SkillSwap AI: 007_sessions_booking_credits. Preparada, NO aplicada.
-- Ofertas aprobadas, disponibilidad, reservas, sesiones, retenciones y valoraciones.
SET SESSION time_zone = '+00:00';
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

CREATE TABLE mentor_offers (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mentor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  skill_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mentor_offer_skill (mentor_user_id, skill_id),
  UNIQUE KEY uq_mentor_offer_id_owner (id, mentor_user_id),
  KEY ix_mentor_offers_status_skill (status, skill_id),
  CONSTRAINT fk_mentor_offer_application FOREIGN KEY (mentor_user_id, skill_id)
    REFERENCES mentor_applications (user_id, skill_id),
  CONSTRAINT fk_mentor_offer_profile FOREIGN KEY (mentor_user_id) REFERENCES student_profiles (user_id),
  CONSTRAINT fk_mentor_offer_skill FOREIGN KEY (skill_id) REFERENCES skill_catalog (id),
  CONSTRAINT chk_mentor_offer_status CHECK (status IN ('ACTIVE', 'PAUSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE mentor_availability (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mentor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(50) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'America/Lima',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mentor_availability_slot (mentor_user_id, weekday, start_time, end_time),
  KEY ix_mentor_availability_lookup (mentor_user_id, weekday, is_active, start_time, end_time),
  CONSTRAINT fk_mentor_availability_profile FOREIGN KEY (mentor_user_id) REFERENCES student_profiles (user_id),
  CONSTRAINT chk_mentor_availability_weekday CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT chk_mentor_availability_time CHECK (start_time < end_time),
  CONSTRAINT chk_mentor_availability_timezone CHECK (timezone = 'America/Lima'),
  CONSTRAINT chk_mentor_availability_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE mentoring_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  student_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mentor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  offer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  starts_at DATETIME(6) NOT NULL,
  ends_at DATETIME(6) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  credit_cost INT NOT NULL,
  status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'UPCOMING',
  meeting_url VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin NULL,
  started_at DATETIME(6) NULL,
  performed_at DATETIME(6) NULL,
  validated_at DATETIME(6) NULL,
  cancelled_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_student_request (student_user_id, request_key),
  UNIQUE KEY uq_session_mentor_start (mentor_user_id, starts_at),
  UNIQUE KEY uq_session_student_start (student_user_id, starts_at),
  UNIQUE KEY uq_session_id_student (id, student_user_id),
  UNIQUE KEY uq_session_id_mentor (id, mentor_user_id),
  KEY ix_sessions_student_status_start (student_user_id, status, starts_at),
  KEY ix_sessions_mentor_status_start (mentor_user_id, status, starts_at),
  KEY ix_sessions_offer_start (offer_id, starts_at),
  CONSTRAINT fk_session_student FOREIGN KEY (student_user_id) REFERENCES student_profiles (user_id),
  CONSTRAINT fk_session_mentor FOREIGN KEY (mentor_user_id) REFERENCES student_profiles (user_id),
  CONSTRAINT fk_session_offer_owner FOREIGN KEY (offer_id, mentor_user_id)
    REFERENCES mentor_offers (id, mentor_user_id),
  CONSTRAINT chk_session_distinct_users CHECK (student_user_id <> mentor_user_id),
  CONSTRAINT chk_session_duration_cost CHECK (
    (duration_minutes = 30 AND credit_cost = 5) OR
    (duration_minutes = 60 AND credit_cost = 10) OR
    (duration_minutes = 90 AND credit_cost = 15)
  ),
  CONSTRAINT chk_session_interval CHECK (
    starts_at < ends_at AND TIMESTAMPDIFF(MINUTE, starts_at, ends_at) = duration_minutes
  ),
  CONSTRAINT chk_session_status CHECK (
    status IN ('UPCOMING', 'ACTIVE', 'AWAITING_VALIDATION', 'COMPLETED', 'CANCELLED')
  ),
  CONSTRAINT chk_session_state_dates CHECK (
    (status = 'UPCOMING' AND started_at IS NULL AND performed_at IS NULL AND validated_at IS NULL AND cancelled_at IS NULL) OR
    (status = 'ACTIVE' AND started_at IS NOT NULL AND performed_at IS NULL AND validated_at IS NULL AND cancelled_at IS NULL) OR
    (status = 'AWAITING_VALIDATION' AND started_at IS NOT NULL AND performed_at IS NOT NULL AND validated_at IS NULL AND cancelled_at IS NULL) OR
    (status = 'COMPLETED' AND started_at IS NOT NULL AND performed_at IS NOT NULL AND validated_at IS NOT NULL AND cancelled_at IS NULL) OR
    (status = 'CANCELLED' AND started_at IS NULL AND performed_at IS NULL AND validated_at IS NULL AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT chk_session_timestamp_order CHECK (
    (started_at IS NULL OR started_at >= starts_at) AND
    (performed_at IS NULL OR (started_at IS NOT NULL AND performed_at >= started_at AND performed_at >= ends_at)) AND
    (validated_at IS NULL OR (performed_at IS NOT NULL AND validated_at >= performed_at)) AND
    (cancelled_at IS NULL OR cancelled_at >= created_at)
  ),
  CONSTRAINT chk_session_meeting_url CHECK (
    meeting_url IS NULL OR (CHAR_LENGTH(meeting_url) BETWEEN 12 AND 2048 AND LEFT(meeting_url, 8) = 'https://')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE session_credit_holds (
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hold_transaction_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'HELD',
  settlement_transaction_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  refund_transaction_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  settled_at DATETIME(6) NULL,
  refunded_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_id),
  UNIQUE KEY uq_session_hold_transaction (hold_transaction_id),
  UNIQUE KEY uq_session_settlement_transaction (settlement_transaction_id),
  UNIQUE KEY uq_session_refund_transaction (refund_transaction_id),
  KEY ix_session_holds_status_created (status, created_at),
  CONSTRAINT fk_session_hold_session FOREIGN KEY (session_id) REFERENCES mentoring_sessions (id),
  CONSTRAINT fk_session_hold_movement FOREIGN KEY (hold_transaction_id) REFERENCES credit_transactions (id),
  CONSTRAINT fk_session_settlement_movement FOREIGN KEY (settlement_transaction_id) REFERENCES credit_transactions (id),
  CONSTRAINT fk_session_refund_movement FOREIGN KEY (refund_transaction_id) REFERENCES credit_transactions (id),
  CONSTRAINT chk_session_hold_status CHECK (status IN ('HELD', 'SETTLED', 'REFUNDED')),
  CONSTRAINT chk_session_hold_state CHECK (
    (status = 'HELD' AND settlement_transaction_id IS NULL AND refund_transaction_id IS NULL AND settled_at IS NULL AND refunded_at IS NULL) OR
    (status = 'SETTLED' AND settlement_transaction_id IS NOT NULL AND refund_transaction_id IS NULL AND settled_at IS NOT NULL AND refunded_at IS NULL) OR
    (status = 'REFUNDED' AND settlement_transaction_id IS NULL AND refund_transaction_id IS NOT NULL AND settled_at IS NULL AND refunded_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE mentoring_session_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_type VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  from_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL,
  to_status VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_event_type (session_id, event_type),
  KEY ix_session_events_actor_created (actor_user_id, created_at),
  CONSTRAINT fk_session_event_session FOREIGN KEY (session_id) REFERENCES mentoring_sessions (id),
  CONSTRAINT fk_session_event_actor FOREIGN KEY (actor_user_id) REFERENCES users (id),
  CONSTRAINT chk_session_event_type CHECK (
    event_type IN ('BOOKED', 'STARTED', 'PERFORMED', 'VALIDATED', 'CANCELLED', 'REVIEWED')
  ),
  CONSTRAINT chk_session_event_status CHECK (
    (from_status IS NULL OR from_status IN ('UPCOMING', 'ACTIVE', 'AWAITING_VALIDATION', 'COMPLETED', 'CANCELLED')) AND
    (to_status IS NULL OR to_status IN ('UPCOMING', 'ACTIVE', 'AWAITING_VALIDATION', 'COMPLETED', 'CANCELLED'))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE session_reviews (
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reviewer_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mentor_user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(1000) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (session_id),
  KEY ix_session_reviews_mentor_created (mentor_user_id, created_at),
  CONSTRAINT fk_session_review_student FOREIGN KEY (session_id, reviewer_user_id)
    REFERENCES mentoring_sessions (id, student_user_id),
  CONSTRAINT fk_session_review_mentor FOREIGN KEY (session_id, mentor_user_id)
    REFERENCES mentoring_sessions (id, mentor_user_id),
  CONSTRAINT chk_session_review_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_session_review_comment CHECK (
    comment IS NULL OR CHAR_LENGTH(TRIM(comment)) BETWEEN 1 AND 1000
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO schema_migrations (version, checksum)
VALUES (@skillswap_migration_version, @skillswap_migration_checksum);
