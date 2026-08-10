-- ============================================================
-- SHMS Dashboard - Database Init
-- Run: psql -h localhost -p 6543 -U dsi -d shms -f init_db.sql
--
-- Jika error "permission denied for schema public", jalankan
-- SEKALI ini sebagai superuser (postgres):
--   psql -h localhost -p 6543 -U postgres -d shms -c "GRANT CREATE ON SCHEMA public TO dsi;"
-- ============================================================

-- ============================================================
-- Email Configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_config (
    id SERIAL PRIMARY KEY,
    smtp_host VARCHAR(255) DEFAULT 'smtp.gmail.com',
    smtp_port INTEGER DEFAULT 587,
    smtp_user VARCHAR(255),
    smtp_password VARCHAR(255),
    from_email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.email_recipients (
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

INSERT INTO public."user" (username, password, role, menu_access) VALUES
    ('admin', 'shms2026', 'admin', NULL),
    ('operator', 'barelang123', 'operator', 'tiltmeter'),
    ('teguhsms', 'teguhsms', 'admin', NULL),
    ('dywidag', 'dywidag', 'dywidag_user', NULL),
    ('npea', 'npea2026', 'operator', 'strain,tiltmeter,reports,bridge_info,system_doc'),
    ('ikn1b', 'ikn1b', 'operator', 'strain,tiltmeter,reports,bridge_info,system_doc,sensor_info_new,logger_info')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Bridge Information
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bridge_info (
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

INSERT INTO public.bridge_info (
    bridge_name, location, super_structure_type, girder_type,
    pylon_type, cable_type, sub_structure_type, length_span,
    width_lanes, pylon_height, design_live_load, earthquake_load,
    etc, bridge_completion, design_by, construction_by, bridge_manager
) SELECT
    'FISABILILLAH Bridges',
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
WHERE NOT EXISTS (SELECT 1 FROM public.bridge_info);

-- ============================================================
-- Sensor Position
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sensor_position (
    id SERIAL PRIMARY KEY,
    sensor_id VARCHAR(100) NOT NULL UNIQUE,
    pos_x DOUBLE PRECISION NOT NULL,
    pos_y DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.sensor_position (sensor_id, pos_x, pos_y) VALUES
    ('STRAIN_001', 15, 48),
    ('STRAIN_002', 32, 35),
    ('STRAIN_003', 48, 52),
    ('STRAIN_004', 65, 30),
    ('STRAIN_005', 82, 45),
    ('STRAIN_011', 25, 60),
    ('STRAIN_012', 55, 62),
    ('STRAIN_013', 75, 38),
    ('STRAIN01', 18.4944, 29.3301),
    ('STRAIN02', 20.4686, 41.4819),
    ('STRAIN03', 23.3216, 39.4072),
    ('STRAIN04', 52.185, 81.9386),
    ('STRAIN05', 52.519, 27.4036)
ON CONFLICT (sensor_id) DO NOTHING;

-- ============================================================
-- Sensor Group
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sensor_group (
    id SERIAL PRIMARY KEY,
    group_code VARCHAR(20) NOT NULL,
    sensor_type VARCHAR(50) NOT NULL,
    UNIQUE(group_code, sensor_type)
);

INSERT INTO public.sensor_group (group_code, sensor_type) VALUES
    ('A', 'Anemometer'),
    ('A', 'Seismik'),
    ('B', 'GNSS'),
    ('B', 'Strain'),
    ('C', 'Tiltmeter'),
    ('C', 'ATRH'),
    ('C', 'Temp')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Logger Info
-- ============================================================
CREATE TABLE IF NOT EXISTS public.logger_info (
    id SERIAL PRIMARY KEY,
    logger_code VARCHAR(50) NOT NULL,
    type VARCHAR(50),
    location VARCHAR(50),
    logger_name VARCHAR(50),
    logger_product VARCHAR(50),
    logger_manufacture VARCHAR(50),
    logger_model VARCHAR(50),
    logger_serial VARCHAR(50),
    install_timestamp TEXT,
    ip_address VARCHAR(50),
    status VARCHAR(50)
);

INSERT INTO public.logger_info (logger_code, type, location, logger_name, logger_product, logger_manufacture, logger_model, logger_serial, install_timestamp, ip_address, status) VALUES
    ('EQK1', 'Dynamic', 'Pylon', 'EQK1', 'EQK-Series', 'KQE', 'EQK', 'SN00001', '23/03/2023 10.51', '10.12.49.80', '12'),
    ('EQK2', 'Dynamic', 'Pylon', 'EQK2', 'EQK-Series', 'KQE', 'EQK', 'SN00010', '20/03/2023 21.51', '10.12.49.81', '15'),
    ('WP', 'Dynamic', 'Middle Span', 'WP', 'WP-Series', 'PW', 'WP', 'SN00091', '22/03/2023 23.51', '10.12.49.20', '9'),
    ('WT', 'Dynamic', 'Middle Span2', 'WT', 'WT-Series', 'TW', 'WT', 'SN00003', '23/03/2023 08.51', '10.12.49.21', '2'),
    ('DL01', 'Dynamic', 'Pylon', 'DL01', 'E-Series', 'Ganter', 'Q-station', '753922', '21/03/2023 10.50', '10.12.49.70', '3'),
    ('DL02', 'Dynamic', 'Pylon2', 'DL02', 'E-Series', 'Ganter', 'Q-station', '753923', '23/02/2023 10.50', '10.12.49.71', '13'),
    ('GNSS2', 'Dynamic', 'Pylon2', 'GNSS2', 'GPS-Series', 'GPS', 'Gantner', '104260', '19/02/2023 10.50', '10.12.49.11', '17'),
    ('GNSS3', 'Dynamic', 'Pylon3', 'GNSS3', 'GPS-Series', 'GPS', 'Gantner', '104621', '02/11/2023', '10.12.49.13', '2'),
    ('GNSS4', 'Dynamic', 'Middle Span', 'GNSS4', 'GPS-Series', 'GPS', 'Gantner', '104621', '28/01/2023 10.50', '10.12.49.12', '24')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Storage Info
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storage_info (
    id BIGINT PRIMARY KEY,
    disk_free VARCHAR(255),
    disk_name VARCHAR(255),
    disk_percentage DOUBLE PRECISION,
    disk_total VARCHAR(255),
    disk_used VARCHAR(255),
    local_datetime TIMESTAMP,
    remote_host_name VARCHAR(255)
);

-- ============================================================
-- Sensor Info (Master Metadata)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sensor_info (
    id SERIAL PRIMARY KEY,
    sensor_id VARCHAR(100),
    sensor_code VARCHAR(100),
    channel_code VARCHAR(50),
    logger VARCHAR(50),
    channel_index INTEGER,
    sensor_type VARCHAR(50),
    sensor_group VARCHAR(50),
    sampling_hz INTEGER,
    direction VARCHAR(50),
    location VARCHAR(255),
    operation VARCHAR(10),
    trigger_setting VARCHAR(10),
    manufacturer VARCHAR(100),
    model VARCHAR(100),
    serial_no VARCHAR(100),
    install_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remove_at TIMESTAMP,
    ip_address VARCHAR(50),
    port VARCHAR(10),
    th1 NUMERIC,
    th2 NUMERIC,
    th1_tension DOUBLE PRECISION,
    th2_tension DOUBLE PRECISION,
    th1_compression DOUBLE PRECISION,
    th2_compression DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_sensor_info_sensor_id ON public.sensor_info(sensor_id);
CREATE INDEX IF NOT EXISTS idx_sensor_info_sensor_code ON public.sensor_info(sensor_code);

INSERT INTO public.sensor_info (sensor_code, channel_code, logger, channel_index, sensor_type, sensor_group, sampling_hz, direction, location, operation, trigger_setting, manufacturer, model, serial_no, install_at, sensor_id, th1, th2, th1_tension, th2_tension, th1_compression, th2_compression) VALUES
    ('FB_WG_S2M_01', 'FB_WG_S2M_01_D', 'WP', 0, 'Anemometer 2D', 'A', 1, 'D', '1/2 of the mid-span(Left)', 'O', 'X', 'R.M. Young', '9106', NULL, '2026-03-03 08:00:17', 'anm2d01', 18.5, 25.0, NULL, NULL, NULL, NULL),
    ('FB_WG_S2M_01', 'FB_WG_S2M_01_S', 'WP', 1, 'Anemometer 2D', 'A', 1, 'S', '1/2 of the mid-span(Left)', 'O', 'X', 'R.M. Young', '9106', NULL, '2026-03-03 08:00:17', 'anm2d01', 18.5, 25.0, NULL, NULL, NULL, NULL),
    ('FB_AM_M_AM31', 'FB_AM_M_AM31_1', 'AM3', 1, 'Anemometer 3D', 'A', 1, 'W', '1/2 of the mid-span(West)', 'O', 'X', 'R.M. Young', '81000', NULL, '2026-03-03 08:00:17', 'anm3d01', 18.5, 25.0, NULL, NULL, NULL, NULL),
    ('FB_AM_M_AM32', 'FB_AM_M_AM31_2', 'AM3', 0, 'Anemometer 3D', 'A', 1, 'E', '1/2 of the mid-span(East)', 'O', 'X', 'R.M. Young', '81000', NULL, '2026-03-03 08:00:17', 'anm3d02', 18.5, 25.0, NULL, NULL, NULL, NULL),
    ('FB_FB_RH_S2M', 'FB_FB_RH_S2M_01', 'atrh', 31, 'ATRH', 'C', 1, '-', 'Main Span 1/2 (Right)', 'O', 'X', 'LUFFT', 'WS700', NULL, '2026-03-03 08:00:17', 'atrh01', 35, 40, NULL, NULL, NULL, NULL),
    ('FB_TP_S1Q1_01', 'FB_TP_S1Q1_01', 'DL01', 37, 'Structural Temperature', 'C', 1, '-', 'girder start point 1/4 point of side span Left girder', 'O', 'X', 'DongYang', 'DS-4070', NULL, '2026-03-03 08:00:17', 'temp01', NULL, NULL, NULL, NULL, NULL, NULL),
    ('FB_TP_S1Q1_02', 'FB_TP_S1Q1_02', 'DL01', 38, 'Structural Temperature', 'C', 1, '-', 'Left bottom plate at 1/4 point of side span at the point of girder', 'O', 'X', 'DongYang', 'DS-4070', NULL, '2026-03-03 08:00:17', 'temp02', NULL, NULL, NULL, NULL, NULL, NULL),
    ('FB_TP_S1Q1_03', 'FB_TP_S1Q1_03', 'DL01', 39, 'Structural Temperature', 'C', 1, '-', 'Right bottom plate at 1/4 point of side span at the point of girder', 'O', 'X', 'DongYang', 'DS-4070', NULL, '2026-03-03 08:00:17', 'temp03', NULL, NULL, NULL, NULL, NULL, NULL),
    ('KDI_AC3_M_04', 'AC3_04', 'AC3', 4, 'Accelerometer (Deck)', 'B', 100, 'E', 'Mid Span', 'O', 'X', 'DYWIDAG', 'nRES2', '20231001026', '2026-04-27 00:00:00', 'acc3-kdi-04', NULL, NULL, NULL, NULL, NULL, NULL),
    ('FB_CA_L07', 'FB_CA_L07_EZ', 'DL01', 2, 'Accelerometer (Cable)', 'B', 100, 'EZ', '07 (S8N_L) on the left of the cable from Batam Island', 'O', 'O', 'Newconstech', 'AC310-005', NULL, '2026-03-03 08:00:17', 'acc_ct02', NULL, NULL, NULL, NULL, NULL, NULL),
    ('STRAIN01', 'STRAIN_TEMP', 'MQTT', 1, 'Strain', 'B', 1, '-', '-', 'O', 'O', '-', '-', '-', '2026-06-02 00:00:00', 'STRAIN01', 20.0, 25.0, 20, 25, -15, -18),
    ('STRAIN02', 'STRAIN_TEMP', 'MQTT', 1, 'Strain', 'B', 1, '-', '-', 'O', 'O', '-', '-', '-', '2026-06-02 00:00:00', 'STRAIN02', 20.0, 25.0, 20, 25, -15, -20),
    ('STRAIN03', 'STRAIN_TEMP', 'MQTT', 1, 'Strain', 'B', 1, '-', '-', 'O', 'O', '-', '-', '-', '2026-06-02 00:00:00', 'STRAIN03', 20.0, 25.0, 20, 25, -15, -20),
    ('STRAIN04', 'STRAIN_TEMP', 'MQTT', 1, 'Strain', 'B', 1, '-', '-', 'O', 'O', '-', '-', '-', '2026-06-02 00:00:00', 'STRAIN04', 20.0, 25.0, 20, 25, -15, -20),
    ('STRAIN05', 'STRAIN_TEMP', 'MQTT', 1, 'Strain', 'B', 1, '-', '-', 'O', 'O', '-', '-', '-', '2026-06-02 00:00:00', 'STRAIN05', 20.0, 25.0, 20, 25, -15, -20),
    ('TILT01', 'ANGLE_XY', 'TILT', 1, 'Tiltmeter', 'C', 1, 'X/Y', '-', 'O', 'O', '-', '-', '-', '2026-05-27 00:00:00', 'TILT01', 0.2, 0.3, NULL, NULL, NULL, NULL),
    ('TILT02', 'ANGLE_XY', 'TILT', 1, 'Tiltmeter', 'C', 1, 'X/Y', '-', 'O', 'O', '-', '-', '-', '2026-05-27 00:00:00', 'TILT02', NULL, NULL, NULL, NULL, NULL, NULL),
    ('TILT03', 'ANGLE_XY', 'TILT', 1, 'Tiltmeter', 'C', 1, 'X/Y', '-', 'O', 'O', '-', '-', '-', '2026-05-27 00:00:00', 'TILT03', NULL, NULL, NULL, NULL, NULL, NULL),
    ('TILT04', 'ANGLE_XY', 'TILT', 1, 'Tiltmeter', 'C', 1, 'X/Y', '-', 'O', 'O', '-', '-', '-', '2026-05-27 00:00:00', 'TILT04', NULL, NULL, NULL, NULL, NULL, NULL),
    ('TILT05', 'ANGLE_XY', 'TILT', 1, 'Tiltmeter', 'C', 1, 'X/Y', '-', 'O', 'O', '-', '-', '-', '2026-05-27 00:00:00', 'TILT05', NULL, NULL, NULL, NULL, NULL, NULL),
    ('TILT06', 'ANGLE_XY', 'TILT', 1, 'Tiltmeter', 'C', 1, 'X/Y', '-', 'O', 'O', '-', '-', '-', '2026-05-27 00:00:00', 'TILT06', NULL, NULL, NULL, NULL, NULL, NULL),
    ('ACC2-KDI-01', 'ACC', 'MQTT', 1, 'Accelerometer', 'Accelerometer', 1, '-', '-', 'O', 'O', '-', '-', '-', '2026-04-24 00:00:00', 'acc2-kdi-01', NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Tilt DSP Properties
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tilt_dsp_properties (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    bridge_name VARCHAR(50) DEFAULT 'Indonesia Bridge',
    l_bridge DOUBLE PRECISION,
    delta_x DOUBLE PRECISION,
    threshold_warning_mm DOUBLE PRECISION,
    threshold_critical_mm DOUBLE PRECISION,
    threshold_emergency_mm DOUBLE PRECISION,
    threshold_rotation_deg DOUBLE PRECISION DEFAULT 0.01,
    description TEXT
);

INSERT INTO public.tilt_dsp_properties (bridge_name, l_bridge, delta_x, threshold_warning_mm, threshold_critical_mm, threshold_emergency_mm, threshold_rotation_deg, description) VALUES
    ('Jembatan Pulau Balang', 200, 50, 250, 350, 400, 0.01, 'Konfigurasi standar operasional')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Main Sensor Data Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anm2d (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    wind_speed DOUBLE PRECISION,
    wind_direction DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_anm2d_sensor_time ON public.anm2d(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS public.anm3d (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    wind_speed DOUBLE PRECISION,
    wind_direction DOUBLE PRECISION,
    wind_elevation DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_anm3d_sensor_time ON public.anm3d(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS public.atrhs (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_atrhs_sensor_time ON public.atrhs(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS public.temps (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    temperature DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_temps_sensor_time ON public.temps(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS public.cable_stays (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    force DOUBLE PRECISION,
    stress DOUBLE PRECISION,
    temperature DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_cable_stays_sensor_time ON public.cable_stays(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS public.tiltmeter (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    angle_x DOUBLE PRECISION,
    angle_y DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_tiltmeter_sensor_time ON public.tiltmeter(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS public.tilt_displacement (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(30),
    deflection_mm DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS public.strain (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT now(),
    source_ts TIMESTAMP,
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    strain_ue DOUBLE PRECISION,
    temp_c DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_strain_sensor_time ON public.strain(sensor_id, time DESC);

CREATE TABLE IF NOT EXISTS public.accelerometers (
    id BIGSERIAL PRIMARY KEY,
    sensor_id TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    ax DOUBLE PRECISION,
    ay DOUBLE PRECISION,
    az DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_accelerometers_time ON public.accelerometers("timestamp" DESC);

-- ============================================================
-- Modal Analysis Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.modal_results (
    id BIGSERIAL PRIMARY KEY,
    analysis_time TIMESTAMPTZ NOT NULL,
    mode_number INTEGER NOT NULL,
    frequency DOUBLE PRECISION,
    damping DOUBLE PRECISION,
    temperature DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_modal_time ON public.modal_results(analysis_time DESC);

CREATE TABLE IF NOT EXISTS public.mode_shapes (
    id BIGSERIAL PRIMARY KEY,
    analysis_time TIMESTAMPTZ NOT NULL,
    mode_number INTEGER NOT NULL,
    shape_vector JSONB
);
CREATE INDEX IF NOT EXISTS idx_modeshape_time ON public.mode_shapes(analysis_time DESC);

CREATE TABLE IF NOT EXISTS public.modal_baseline (
    mode_number INTEGER PRIMARY KEY,
    baseline_frequency DOUBLE PRECISION,
    baseline_damping DOUBLE PRECISION,
    baseline_temp DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.modal_temp_coeff (
    mode_number INTEGER PRIMARY KEY,
    alpha DOUBLE PRECISION
);

-- ============================================================
-- Views: Modal Analysis
-- ============================================================
CREATE OR REPLACE VIEW public.modal_frequency_drift AS
SELECT r.analysis_time,
    r.mode_number,
    r.frequency,
    b.baseline_frequency,
    round(((((r.frequency - b.baseline_frequency) / b.baseline_frequency))::numeric * 100::numeric), 3) AS freq_drift_percent
FROM public.modal_results r
JOIN public.modal_baseline b ON r.mode_number = b.mode_number;

CREATE OR REPLACE VIEW public.modal_alert_status AS
SELECT analysis_time, mode_number, frequency, baseline_frequency, freq_drift_percent,
    CASE
        WHEN abs(freq_drift_percent) > 7 THEN 'CRITICAL'
        WHEN abs(freq_drift_percent) > 5 THEN 'ALARM'
        WHEN abs(freq_drift_percent) > 3 THEN 'WARNING'
        ELSE 'NORMAL'
    END AS status
FROM public.modal_frequency_drift;

CREATE OR REPLACE VIEW public.modal_corrected AS
SELECT r.analysis_time, r.mode_number, r.frequency, r.temperature, c.alpha,
    (r.frequency - (c.alpha * (r.temperature - 30::double precision))) AS corrected_frequency
FROM public.modal_results r
JOIN public.modal_temp_coeff c ON r.mode_number = c.mode_number;

CREATE OR REPLACE VIEW public.persistent_warning AS
SELECT mode_number, count(*) AS warning_count
FROM public.modal_alert_status
WHERE status = ANY (ARRAY['ALARM', 'CRITICAL'])
  AND analysis_time > (now() - '7 days'::interval)
GROUP BY mode_number
HAVING count(*) > 3;

CREATE OR REPLACE VIEW public.structural_health_index AS
SELECT analysis_time,
    round((100::numeric - sum((abs(freq_drift_percent) * 5::numeric))), 2) AS health_score
FROM public.modal_frequency_drift
GROUP BY analysis_time;

-- ============================================================
-- View: Bridge Monitoring (tiltmeter + displacement)
-- ============================================================
CREATE OR REPLACE VIEW public.v_bridge_monitoring AS
SELECT t.time, t.sensor_id, t.angle_x, d.deflection_mm
FROM public.tiltmeter t
LEFT JOIN public.tilt_displacement d ON t.sensor_id = d.sensor_id AND t.time = d.time;

-- ============================================================
-- Statistic / Aggregation Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anm2d_statistic (
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
CREATE INDEX IF NOT EXISTS idx_anm2d_stat_time ON public.anm2d_statistic(time);
CREATE INDEX IF NOT EXISTS idx_anm2d_stat_sensor ON public.anm2d_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS public.anm3d_statistic (
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
CREATE INDEX IF NOT EXISTS idx_anm3d_stat_time ON public.anm3d_statistic(time);
CREATE INDEX IF NOT EXISTS idx_anm3d_stat_sensor ON public.anm3d_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS public.atrhs_statistic (
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
CREATE INDEX IF NOT EXISTS idx_atrhs_stat_time ON public.atrhs_statistic(time);
CREATE INDEX IF NOT EXISTS idx_atrhs_stat_sensor ON public.atrhs_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS public.temps_statistic (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    sensor_id VARCHAR(50),
    sensor_type VARCHAR(50),
    unit VARCHAR(50),
    min_temperature DOUBLE PRECISION,
    max_temperature DOUBLE PRECISION,
    avg_temperature DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_temps_stat_time ON public.temps_statistic(time);
CREATE INDEX IF NOT EXISTS idx_temps_stat_sensor ON public.temps_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS public.tiltmeter_statistic (
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
CREATE INDEX IF NOT EXISTS idx_tilt_stat_time ON public.tiltmeter_statistic(time);
CREATE INDEX IF NOT EXISTS idx_tilt_stat_sensor ON public.tiltmeter_statistic(sensor_id);

CREATE TABLE IF NOT EXISTS public.strain_statistic (
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
CREATE INDEX IF NOT EXISTS idx_strain_stat_time ON public.strain_statistic(time);
CREATE INDEX IF NOT EXISTS idx_strain_stat_sensor ON public.strain_statistic(sensor_id);

-- ============================================================
-- Notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    sensor_id TEXT,
    is_read BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_notif_time ON public.notifications(time DESC);

-- ============================================================
-- FFT History
-- ============================================================
CREATE TABLE IF NOT EXISTS public.acc_fft_history (
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
CREATE INDEX IF NOT EXISTS idx_acc_fft_time ON public.acc_fft_history(time);
CREATE INDEX IF NOT EXISTS idx_acc_fft_sensor ON public.acc_fft_history(sensor_id);

-- ============================================================
-- Weekly Periods
-- ============================================================
CREATE TABLE IF NOT EXISTS public.weekly_periods (
    id SERIAL PRIMARY KEY,
    end_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    month VARCHAR(20) NOT NULL,
    periode_label VARCHAR(100) NOT NULL,
    start_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    year CHAR(10) DEFAULT '2025'
);
CREATE INDEX IF NOT EXISTS idx_weekly_ym ON public.weekly_periods(year, month);

-- ============================================================
-- Done
-- ============================================================
SELECT 'All tables created successfully!' AS status;
