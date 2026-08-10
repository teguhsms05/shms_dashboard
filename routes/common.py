import functools
from datetime import datetime
from flask import session, redirect, url_for, flash, request
from db import get_sensors_list, get_cable_tension_sensors
from logger import get_logger

_log = get_logger("common")

MENU_ROUTE_MAP = {
    'dashboard':     ['dashboard.dashboard', 'dashboard.dsi_project'],
    'anm2d':         ['sensors.anm2d_page', 'sensors.anm2d_sensor_page'],
    'anm3d':         ['sensors.anm3d_page', 'sensors.anm3d_sensor_page'],
    'temperature':   ['sensors.temp_page', 'sensors.temp_sensor_page', 'sensors.temp_sensor_location'],
    'atrh':          ['sensors.atrhs_page', 'sensors.atrh_sensor_page'],
    'accelerometer': ['health.accelerometer_page'],
    'vibration':     ['health.vibration_page'],
    'acc_kdi':       ['sensors.acc_kdi_page', 'sensors.acc_kdi_sensor_page'],
    'strain':        ['sensors.strain_page', 'sensors.strain_sensor_page', 'sensors.strain_sensor_location'],
    'strain_trigger':['sensors.strain_trigger_page', 'sensors.strain_trigger_sensor_page'],
    'tiltmeter':     ['sensors.tiltmeter_page', 'sensors.tiltmeter_sensor_page'],
    'cable_stay':    ['sensors.cable_stay_realtime', 'sensors.cable_stay_sensor'],
    'cable_tension': ['sensors.cable_tension_realtime', 'sensors.cable_tension_sensor'],
    'correlation':   ['health.correlation_page'],
    'reports':       ['reports.weekly_report_page', 'reports.monthly_report_page', 'reports.reports_page'],
    'bridge_info':   ['admin.bridge_info'],
    'system_doc':    ['admin.system_doc'],
    'monitoring_items': ['admin.monitoring_items'],
    'sensor_info':   ['admin.sensor_info'],
    'logger_info':   ['admin.logger_info'],
    'sensor_status': ['admin.sensor_status_page'],
}

STRAIN_SENSORS = [
    {"str_id": "STRAIN_05", "host": "36.64.86.161", "port": 4025},
    {"str_id": "STRAIN_11", "host": "36.64.86.161", "port": 4031},
]

ACC_SENSORS = [
    {"acc_id": "acc3-kdi-04", "sensor_id": "20231001026", "host": "103.111.81.238", "port": 5554},
    {"acc_id": "acc2-kdi-01", "sensor_id": "20231001032", "host": "103.111.81.238", "port": 5558},
]


def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("auth.login_page"))
        return f(*args, **kwargs)
    return decorated


def check_menu_access():
    if not session.get('logged_in'):
        return
    if session.get('role') == 'admin':
        return
    endpoint = request.endpoint
    if not endpoint:
        return
    if endpoint in ('auth.login_page', 'auth.logout', 'static',
                    'dashboard.dashboard', 'dashboard.dsi_project'):
        return
    menus = (session.get('menu_access', '') or '').split(',')
    if not session.get('menu_access', '').strip():
        return
    for menu_key, endpoints in MENU_ROUTE_MAP.items():
        if endpoint in endpoints:
            if menu_key not in menus:
                flash("You do not have permission to access that page.", "error")
                return redirect(url_for('dashboard.dashboard'))
            return


def inject_sensors():
    extra = {"current_year": datetime.now().year}
    try:
        extra.update(
            temp_sensors=get_sensors_list("Temperature"),
            atrh_sensors=get_sensors_list("ATRH"),
            cable_sensors=get_sensors_list("Cable Stay"),
            cable_tension_sensors=get_cable_tension_sensors(),
            anm2d_sensors=get_sensors_list("Anemometer 2D"),
            anm3d_sensors=get_sensors_list("Anemometer 3D"),
            tiltmeter_sensors=get_sensors_list("Tiltmeter"),
            strain_sensors=get_sensors_list("Strain"),
            strain_trigger_sensors=[s["str_id"] for s in STRAIN_SENSORS],
            acc_kdi_sensors=[s["acc_id"] for s in ACC_SENSORS],
        )
    except Exception as e:
        _log.error("inject_sensors: %s", e)
        extra.update(
            temp_sensors=[], atrh_sensors=[], cable_sensors=[],
            cable_tension_sensors=["CBL%02d" % i for i in range(1, 25)],
            anm2d_sensors=[], anm3d_sensors=[], tiltmeter_sensors=[],
            strain_sensors=[], strain_trigger_sensors=[], acc_kdi_sensors=[],
        )
    return extra
