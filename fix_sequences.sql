-- Fix sequence synchronization for all sensor data tables
-- Run this as superuser or table owner

-- strain table
SELECT setval('strain_id_seq', (SELECT COALESCE(MAX(id), 0) FROM strain));

-- temps table
SELECT setval('temps_id_seq', (SELECT COALESCE(MAX(id), 0) FROM temps));

-- atrhs table
SELECT setval('atrhs_id_seq', (SELECT COALESCE(MAX(id), 0) FROM atrhs));

-- anm2d table
SELECT setval('anm_2d_id_seq', (SELECT COALESCE(MAX(id), 0) FROM anm2d));

-- anm3d table
SELECT setval('anm_3d_id_seq', (SELECT COALESCE(MAX(id), 0) FROM anm3d));

-- tiltmeter table
SELECT setval('tiltmeter_id_seq', (SELECT COALESCE(MAX(id), 0) FROM tiltmeter));

-- cable_stays table
SELECT setval('cable_stays_id_seq', (SELECT COALESCE(MAX(id), 0) FROM cable_stays));

-- acc_fft_history table
SELECT setval('acc_fft_history_id_seq', (SELECT COALESCE(MAX(id), 0) FROM acc_fft_history));

-- Verify sequences
SELECT 'strain' as table_name, last_value as next_id FROM strain_id_seq
UNION ALL
SELECT 'temps', last_value FROM temps_id_seq
UNION ALL
SELECT 'atrhs', last_value FROM atrhs_id_seq
UNION ALL
SELECT 'anm2d', last_value FROM anm_2d_id_seq
UNION ALL
SELECT 'anm3d', last_value FROM anm_3d_id_seq
UNION ALL
SELECT 'tiltmeter', last_value FROM tiltmeter_id_seq
UNION ALL
SELECT 'cable_stays', last_value FROM cable_stays_id_seq
UNION ALL
SELECT 'acc_fft_history', last_value FROM acc_fft_history_id_seq;
