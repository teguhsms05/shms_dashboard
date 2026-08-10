import time
from flask import Blueprint, render_template, request, redirect, session, flash, url_for
from db import get_user_by_username

auth_bp = Blueprint('auth', __name__)

MAX_ATTEMPTS = 5
BLOCK_WINDOW = 900

_login_attempts = {}


@auth_bp.route("/login", methods=["GET", "POST"])
def login_page():
    if session.get("logged_in"):
        return redirect(url_for("dashboard.dashboard"))

    if request.method == "POST":
        ip = request.remote_addr
        now = time.time()

        entry = _login_attempts.get(ip)
        if entry:
            count, first = entry
            if now - first > BLOCK_WINDOW:
                _login_attempts[ip] = (1, now)
            elif count >= MAX_ATTEMPTS:
                remaining = int(BLOCK_WINDOW - (now - first))
                minutes = remaining // 60
                seconds = remaining % 60
                flash(f"Too many login attempts. Please try again in {minutes}m {seconds}s.", "error")
                return render_template("login.html")

        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        remember = request.form.get("remember")

        user_record = get_user_by_username(username)
        if user_record and user_record["password"] == password:
            _login_attempts.pop(ip, None)
            session.permanent = bool(remember)
            session["logged_in"] = True
            session["username"] = username
            session["role"] = user_record["role"]
            menu_access = user_record.get("menu_access", "")
            if not menu_access and user_record["role"] != "admin":
                menu_access = "dashboard,anm2d,anm3d,temperature,atrh,accelerometer,vibration,acc_kdi,strain,strain_trigger,tiltmeter,cable_stay,correlation,reports,bridge_info,system_doc,monitoring_items,sensor_info,logger_info,sensor_status"
            session["menu_access"] = menu_access
            flash(f"Welcome back, {username}!", "success")
            return redirect(url_for("dashboard.dashboard"))
        else:
            if entry and now - first <= BLOCK_WINDOW:
                _login_attempts[ip] = (count + 1, first)
            else:
                _login_attempts[ip] = (1, now)
            remaining_attempts = MAX_ATTEMPTS - (_login_attempts[ip][0] if _login_attempts[ip][0] <= MAX_ATTEMPTS else MAX_ATTEMPTS)
            flash(f"Invalid username or password. {remaining_attempts} attempt(s) remaining.", "error")
    return render_template("login.html")


@auth_bp.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.", "success")
    return redirect(url_for("auth.login_page"))
