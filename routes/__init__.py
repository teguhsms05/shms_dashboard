from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.user_management import user_bp
from routes.admin import admin_bp
from routes.sensors import sensors_bp
from routes.reports import reports_bp
from routes.health import health_bp
from routes.notifications import notifications_bp
from routes.internal import internal_bp


def register_blueprints(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(sensors_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(internal_bp)
