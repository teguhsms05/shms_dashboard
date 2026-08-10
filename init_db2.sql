-- ============================================================
-- SHMS Dashboard - Database Init
-- Run: psql -p 6543 -U dsi -d shms -f init_db.sql
-- ============================================================

-- ============================================================
-- Email Configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS email_config (
    id SERIAL PRIMARY KEY,
    smtp_host VARCHAR(255) DEFAULT 'smtp.gmail.com',
    smtp_port INTEGER DEFAULT 587,
    smtp_user VARCHAR(255),
    smtp_password VARCHAR(255),
    from_email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS email_recipients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- User Management
-- ============================================================
CREATE TABLE IF NOT EXISTS public."user" (
    id SERIAL PRIMARY KEY,
    username TEXT,
    password TEXT,
    role TEXT,
    menu_access TEXT
);

INSERT INTO public."user" (username, password, role)
SELECT 'admin', 'shms2026', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM public."user" WHERE username = 'admin');

INSERT INTO public."user" (username, password, role)
SELECT 'operator', 'barelang123', 'operator'
WHERE NOT EXISTS (SELECT 1 FROM public."user" WHERE username = 'operator');

-- ============================================================
-- Bridge Information
-- ============================================================
CREATE TABLE IF NOT EXISTS bridge_info (
    id SERIAL PRIMARY KEY,
    bridge_name VARCHAR(255),
    location VARCHAR(255),
    super_structure_type VARCHAR(100),
    girder_type VARCHAR(100),
    pylon_type VARCHAR(100),
    cable_type VARCHAR(100),
    sub_structure_type VARCHAR(100),
    length_span VARCHAR(255),
    width_lanes VARCHAR(100),
    pylon_height VARCHAR(100),
    design_live_load VARCHAR(255),
    earthquake_load VARCHAR(100),
    etc VARCHAR(255),
    bridge_completion VARCHAR(50),
    design_by VARCHAR(255),
    construction_by VARCHAR(255),
    bridge_manager VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO bridge_info (
    bridge_name, location, super_structure_type, girder_type,
    pylon_type, cable_type, sub_structure_type, length_span,
    width_lanes, pylon_height, design_live_load, earthquake_load,
    etc, bridge_completion, design_by, construction_by, bridge_manager
) SELECT
    'FISABILILLAH Bridge',
    'Batam Island and Tonton Island',
    'Cable-Stayed',
    'Concrete Edge Girder',
    'A Type',
    'Parallel Strand Cable (PSC)',
    'Pile Foundation',
    'L = 641.8m (145.9m + 350.0m + 145.9m)',
    'B = 21.5m (4 lanes)',
    '119.764m',
    'Design Live load of SNI 1992',
    'Seismic Zone 1',
    '-',
    '1998',
    'LAPI ITB',
    'PT. Pembangunan Perumahan',
    'BPJN Kepulauan Riau'
WHERE NOT EXISTS (SELECT 1 FROM bridge_info);

-- ============================================================
-- Sensor Position
-- ============================================================
CREATE TABLE IF NOT EXISTS sensor_position (
    id SERIAL PRIMARY KEY,
    sensor_id VARCHAR(100) NOT NULL UNIQUE,
    pos_x FLOAT NOT NULL,
    pos_y FLOAT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sensor_position (sensor_id, pos_x, pos_y) VALUES
    ('STRAIN_001', 15, 48),
    ('STRAIN_002', 32, 35),
    ('STRAIN_003', 48, 52),
    ('STRAIN_004', 65, 30),
    ('STRAIN_005', 82, 45),
    ('STRAIN_011', 25, 60),
    ('STRAIN_012', 55, 62),
    ('STRAIN_013', 75, 38)
ON CONFLICT (sensor_id) DO NOTHING;

-- ============================================================
-- Sensor Info (Master Metadata)
-- ============================================================
CREATE TABLE IF NOT EXISTS sensor_info (
    id SERIAL PRIMARY KEY,
    sensor_id VARCHAR(100),
    sensor_code VARCHAR(100),
    channel_code VARCHAR(50),
    logger VARCHAR(50),
    channel_index INTEGER,
    sensor_type VARCHAR(50),
    sensor_group VARCHAR(50),
    sampling_hz FLOAT,
    direction VARCHAR(50),
    location VARCHAR(255),
    operation VARCHAR(10),
    trigger_setting VARCHAR(10),
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    serial_no VARCHAR(100),
    install_at DATE,
    ip_address VARCHAR(50),
    port INTEGER,
    th1 FLOAT,
    th2 FLOAT,
    th1_tension FLOAT,
    th2_tension FLOAT,
    th1_compression FLOAT,
    th2_compression FLOAT
);
CREATE INDEX IF NOT EXISTS idx_sensor_info_sensor_id ON sensor_info(sensor_id);
CREATE INDEX IF NOT EXISTS idx_sensor_info_sensor_code ON sensor_info(sensor_code);

-- ============================================================
-- Main Sensor Data Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS anm2d (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    wind_speed FLOAT,
    wind_direction FLOAT
);
CREATE INDEX IF NOT EXISTS idx_anm2d_sensor_time ON anm2d(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS anm3d (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    wind_speed FLOAT,
    wind_direction FLOAT,
    wind_elevation FLOAT
);
CREATE INDEX IF NOT EXISTS idx_anm3d_sensor_time ON anm3d(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS atrhs (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    temperature FLOAT,
    humidity FLOAT
);
CREATE INDEX IF NOT EXISTS idx_atrhs_sensor_time ON atrhs(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS temps (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    temperature FLOAT
);
CREATE INDEX IF NOT EXISTS idx_temps_sensor_time ON temps(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS cable_stays (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    force FLOAT,
    stress FLOAT,
    temperature FLOAT
);
CREATE INDEX IF NOT EXISTS idx_cable_stays_sensor_time ON cable_stays(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS tiltmeter (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    angle_x FLOAT,
    angle_y FLOAT
);
CREATE INDEX IF NOT EXISTS idx_tiltmeter_sensor_time ON tiltmeter(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS strain (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    strain_ue FLOAT,
    temp_c FLOAT
);
CREATE INDEX IF NOT EXISTS idx_strain_sensor_time ON strain(sensor_id, time DESC);

-- ============================================================
-- Statistic / Aggregation Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS anm2d_statistic (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    min_wind_speed DOUBLE PRECISION,
    max_wind_speed DOUBLE PRECISION,
    avg_wind_speed DOUBLE PRECISION,
    min_wind_direction DOUBLE PRECISION,
    max_wind_direction DOUBLE PRECISION,
    avg_wind_direction DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_anm2d_stat_time ON anm2d_statistic(time);
CREATE INDEX IF NOT EXISTS idx_anm2d_stat_sensor ON anm2d_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS anm3d_statistic (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(20),
    min_wind_speed DOUBLE PRECISION,
    max_wind_speed DOUBLE PRECISION,
    avg_wind_speed DOUBLE PRECISION,
    min_wind_direction DOUBLE PRECISION,
    max_wind_direction DOUBLE PRECISION,
    avg_wind_direction DOUBLE PRECISION,
    min_wind_elevation DOUBLE PRECISION,
    max_wind_elevation DOUBLE PRECISION,
    avg_wind_elevation DOUBLE PRECISION,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_anm3d_stat_time ON anm3d_statistic(time);
CREATE INDEX IF NOT EXISTS idx_anm3d_stat_sensor ON anm3d_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS atrhs_statistic (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    min_temperature DOUBLE PRECISION,
    max_temperature DOUBLE PRECISION,
    avg_temperature DOUBLE PRECISION,
    min_humidity DOUBLE PRECISION,
    max_humidity DOUBLE PRECISION,
    avg_humidity DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_atrhs_stat_time ON atrhs_statistic(time);
CREATE INDEX IF NOT EXISTS idx_atrhs_stat_sensor ON atrhs_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS temps_statistic (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    min_temperature DOUBLE PRECISION,
    max_temperature DOUBLE PRECISION,
    avg_temperature DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_temps_stat_time ON temps_statistic(time);
CREATE INDEX IF NOT EXISTS idx_temps_stat_sensor ON temps_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS tiltmeter_statistic (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP NOT NULL,
    sensor_id VARCHAR(50) NOT NULL,
    sensor_type VARCHAR(50),
    unit VARCHAR(20),
    min_angle_x DOUBLE PRECISION,
    max_angle_x DOUBLE PRECISION,
    avg_angle_x DOUBLE PRECISION,
    min_angle_y DOUBLE PRECISION,
    max_angle_y DOUBLE PRECISION,
    avg_angle_y DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tilt_stat_time ON tiltmeter_statistic(time);
CREATE INDEX IF NOT EXISTS idx_tilt_stat_sensor ON tiltmeter_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS strain_statistic (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(20),
    min_strain_ue DOUBLE PRECISION,
    max_strain_ue DOUBLE PRECISION,
    avg_strain_ue DOUBLE PRECISION,
    min_temp_c DOUBLE PRECISION,
    max_temp_c DOUBLE PRECISION,
    avg_temp_c DOUBLE PRECISION,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_strain_stat_time ON strain_statistic(time);
CREATE INDEX IF NOT EXISTS idx_strain_stat_sensor ON strain_statistic(sensor_id);

-- ============================================================
-- Notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    sensor_id TEXT,
    is_read BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_notif_time ON notifications(time DESC);

-- ============================================================
-- FFT History
-- ============================================================
CREATE TABLE IF NOT EXISTS acc_fft_history (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP(0) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sensor_id VARCHAR(50) NOT NULL,
    x_f1 DOUBLE PRECISION, x_m1 DOUBLE PRECISION,
    x_f2 DOUBLE PRECISION, x_m2 DOUBLE PRECISION,
    x_f3 DOUBLE PRECISION, x_m3 DOUBLE PRECISION,
    y_f1 DOUBLE PRECISION, y_m1 DOUBLE PRECISION,
    y_f2 DOUBLE PRECISION, y_m2 DOUBLE PRECISION,
    y_f3 DOUBLE PRECISION, y_m3 DOUBLE PRECISION,
    z_f1 DOUBLE PRECISION, z_m1 DOUBLE PRECISION,
    z_f2 DOUBLE PRECISION, z_m2 DOUBLE PRECISION,
    z_f3 DOUBLE PRECISION, z_m3 DOUBLE PRECISION,
    filename VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_acc_fft_time ON acc_fft_history(time);
CREATE INDEX IF NOT EXISTS idx_acc_fft_sensor ON acc_fft_history(sensor_id);

-- ============================================================
-- Weekly Periods
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_periods (
    id SERIAL PRIMARY KEY,
    end_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    month VARCHAR(20) NOT NULL,
    periode_label VARCHAR(100) NOT NULL,
    start_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    year CHAR(10) DEFAULT '2025'
);
CREATE INDEX IF NOT EXISTS idx_weekly_ym ON weekly_periods(year, month);

-- ============================================================
-- Done
-- ============================================================
SELECT 'All tables created successfully!' AS status;