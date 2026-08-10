from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from db import (
    get_all_users, add_user, update_user, delete_user,
)
from routes.common import login_required

user_bp = Blueprint('user_management', __name__)


@user_bp.route("/user-management", methods=["GET", "POST"])
@login_required
def user_management():
    if session.get("role") != "admin" and session.get("username") != "admin":
        flash("You do not have permission to access User Management.", "error")
        return redirect(url_for("dashboard.dashboard"))

    if request.method == "POST":
        action = request.form.get("action")
        if action == "delete":
            user_id = request.form.get("id")
            if delete_user(user_id):
                flash("User deleted successfully!", "success")
            else:
                flash("Failed to delete user.", "error")
        else:
            data = {
                "id": request.form.get("id"),
                "username": request.form.get("username"),
                "password": request.form.get("password"),
                "role": request.form.get("role"),
                "menu_access": request.form.get("menu_access", "")
            }
            if data["id"]:
                if update_user(data):
                    flash("User updated successfully!", "success")
                else:
                    flash("Failed to update user.", "error")
            else:
                if add_user(data):
                    flash("User added successfully!", "success")
                else:
                    flash("Failed to add user.", "error")
        return redirect(url_for("user_management.user_management"))

    users = get_all_users()
    return render_template("user_management.html", users=users)
