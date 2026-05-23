-- =====================================================================
-- Private Lesson Booking, Notification & Payroll System
-- =====================================================================

-- 1. DISCIPLINES
CREATE TABLE IF NOT EXISTS disciplines (
  id            SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disciplines_org_idx ON disciplines(organization_id);

-- 2. OPERATOR PROFILES (one per operator user)
CREATE TABLE IF NOT EXISTS operator_profiles (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_type    TEXT NOT NULL CHECK (profile_type IN ('paid','volunteer')),
  bio             TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);
CREATE INDEX IF NOT EXISTS op_profiles_org_idx ON operator_profiles(organization_id);

-- 3. OPERATOR DISCIPLINE RATES (paid operators get per-discipline hourly rate)
CREATE TABLE IF NOT EXISTS operator_discipline_rates (
  id                  SERIAL PRIMARY KEY,
  operator_profile_id INTEGER NOT NULL REFERENCES operator_profiles(id) ON DELETE CASCADE,
  discipline_id       INTEGER NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  hourly_rate_cents   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (operator_profile_id, discipline_id)
);

-- 4. OPERATOR AVAILABILITY SLOTS
CREATE TABLE IF NOT EXISTS operator_availability (
  id                  SERIAL PRIMARY KEY,
  operator_profile_id INTEGER NOT NULL REFERENCES operator_profiles(id) ON DELETE CASCADE,
  organization_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  discipline_id       INTEGER NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  location            TEXT NOT NULL,
  slot_date           DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','booked')),
  parent_price_cents  INTEGER,           -- set by admin when approving
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS availability_op_idx  ON operator_availability(operator_profile_id);
CREATE INDEX IF NOT EXISTS availability_org_idx ON operator_availability(organization_id);
CREATE INDEX IF NOT EXISTS availability_date_idx ON operator_availability(slot_date);

-- 5. PRIVATE BOOKINGS
CREATE TABLE IF NOT EXISTS private_bookings (
  id                    SERIAL PRIMARY KEY,
  organization_id       INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  availability_id       INTEGER NOT NULL REFERENCES operator_availability(id) ON DELETE RESTRICT,
  child_id              INTEGER NOT NULL REFERENCES children(id) ON DELETE RESTRICT,
  parent_user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operator_user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  discipline_id         INTEGER NOT NULL REFERENCES disciplines(id),
  location              TEXT NOT NULL,
  slot_date             DATE NOT NULL,
  start_time            TIME NOT NULL,
  end_time              TIME NOT NULL,
  price_cents           INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  qr_token              TEXT UNIQUE,
  attended_at           TIMESTAMPTZ,
  earnings_cents        INTEGER,         -- calculated on QR scan
  operator_notes        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_parent_idx   ON private_bookings(parent_user_id);
CREATE INDEX IF NOT EXISTS bookings_operator_idx ON private_bookings(operator_user_id);
CREATE INDEX IF NOT EXISTS bookings_org_idx      ON private_bookings(organization_id);
CREATE INDEX IF NOT EXISTS bookings_avail_idx    ON private_bookings(availability_id);

-- 6. PRIVATE NOTIFICATIONS (drives Supabase Realtime)
CREATE TABLE IF NOT EXISTS private_notifications (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id       INTEGER REFERENCES users(id),
  type            TEXT NOT NULL CHECK (type IN (
    'booking_request','booking_confirmed','booking_cancelled',
    'availability_approved','availability_rejected',
    'lesson_reminder','payment_received'
  )),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  booking_id      INTEGER REFERENCES private_bookings(id) ON DELETE SET NULL,
  read            BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_recipient_idx ON private_notifications(recipient_id, read);
CREATE INDEX IF NOT EXISTS notif_org_idx       ON private_notifications(organization_id);

-- Enable Realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE private_notifications;

-- 7. QR ATTENDANCE RPC
-- Logs attendance on QR scan and calculates operator earnings
CREATE OR REPLACE FUNCTION rpc_log_attendance_and_earnings(
  p_booking_id  INTEGER,
  p_qr_token    TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking     private_bookings%ROWTYPE;
  v_rate        operator_discipline_rates%ROWTYPE;
  v_profile     operator_profiles%ROWTYPE;
  v_duration_h  NUMERIC;
  v_earnings    INTEGER := 0;
  v_invoice_num TEXT;
BEGIN
  -- Fetch & validate booking
  SELECT * INTO v_booking FROM private_bookings
  WHERE id = p_booking_id AND qr_token = p_qr_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking not found or QR mismatch');
  END IF;

  IF v_booking.status != 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking is not confirmed');
  END IF;

  IF v_booking.attended_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already scanned');
  END IF;

  -- Mark attended
  UPDATE private_bookings SET status = 'completed', attended_at = now() WHERE id = p_booking_id;

  -- Mark availability slot as booked (already was, but ensure)
  UPDATE operator_availability SET status = 'booked' WHERE id = v_booking.availability_id;

  -- Calculate earnings for paid operators
  SELECT op.* INTO v_profile FROM operator_profiles op
  WHERE op.user_id = v_booking.operator_user_id AND op.organization_id = v_booking.organization_id;

  IF FOUND AND v_profile.profile_type = 'paid' THEN
    SELECT odr.* INTO v_rate FROM operator_discipline_rates odr
    WHERE odr.operator_profile_id = v_profile.id AND odr.discipline_id = v_booking.discipline_id;

    IF FOUND THEN
      v_duration_h := EXTRACT(EPOCH FROM (v_booking.end_time - v_booking.start_time)) / 3600.0;
      v_earnings := (v_rate.hourly_rate_cents * v_duration_h)::INTEGER;
      UPDATE private_bookings SET earnings_cents = v_earnings WHERE id = p_booking_id;
    END IF;
  END IF;

  -- Generate invoice number
  v_invoice_num := 'PL-' || LPAD(p_booking_id::TEXT, 6, '0') || '-' || TO_CHAR(now(), 'YYYYMMDD');

  -- Insert document (invoice) into documents table
  INSERT INTO documents (
    user_id, organization_id, title, type, file_url, created_at
  ) VALUES (
    v_booking.operator_user_id,
    v_booking.organization_id,
    'Private Lesson Invoice ' || v_invoice_num,
    'invoice',
    '',
    now()
  ) ON CONFLICT DO NOTHING;

  -- Notify operator
  INSERT INTO private_notifications (
    organization_id, recipient_id, sender_id, type, title, body, booking_id
  ) VALUES (
    v_booking.organization_id,
    v_booking.operator_user_id,
    v_booking.parent_user_id,
    'lesson_reminder',
    'Lesson Completed',
    'Attendance logged. Earnings: $' || (v_earnings / 100.0)::TEXT,
    p_booking_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'earnings_cents', v_earnings,
    'invoice_number', v_invoice_num,
    'attended_at', now()
  );
END;
$$;
