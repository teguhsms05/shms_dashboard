from flask import Blueprint, render_template, request, redirect, url_for, flash
from routes.common import login_required

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route("/")
@login_required
def dashboard():
    return render_template("home.html")


@dashboard_bp.route("/threshold", methods=["GET", "POST"])
@login_required
def threshold_page():
    if request.method == "POST":
        sensor = request.form.get("sensor")
        min_value = request.form.get("min_value")
        max_value = request.form.get("max_value")
        flash(f"Threshold for {sensor} saved: min={min_value}, max={max_value}", "success")
        return redirect(url_for("dashboard.threshold_page"))
    return render_template("threshold.html")


@dashboard_bp.route("/dsi-project")
@login_required
def dsi_project():
    return render_template("dsi_project.html")
