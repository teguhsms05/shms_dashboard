/**
 * Notification Manager
 * Handles sensor alerts and UI rendering via Backend API
 */
class NotificationManager {
    constructor() {
        this.notifications = [];
        this.toggleBtn = document.getElementById('notification-toggle');
        this.dropdown = document.getElementById('notification-dropdown');
        this.badge = document.getElementById('notification-badge');
        this.unreadLabel = document.getElementById('unread-count');
        this.container = document.getElementById('notif-items');

        this.init();
    }

    init() {
        if (!this.toggleBtn) return;

        this.toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        document.addEventListener('click', () => {
            if (this.dropdown) this.dropdown.classList.remove('active');
        });

        if (this.dropdown) {
            this.dropdown.addEventListener('click', (e) => e.stopPropagation());
        }

        this.fetchNotifications();
        // Poll every 10 seconds (alerts are now handled by backend)
        setInterval(() => this.fetchNotifications(), 10000);
    }

    async fetchNotifications() {
        try {
            const res = await fetch("/api/notifications");
            this.notifications = await res.json();
            this.render();
        } catch (e) {
            console.error("Error fetching notifications:", e);
            // Non-critical: only show once per session, don't spam
            if (window.SHMToast && !this._notifErrorShown) {
                this._notifErrorShown = true;
                window.SHMToast.info("Gagal memuat notifikasi dari server", "Notifikasi", 5000);
            }
        }
    }

    async toggleDropdown() {
        if (!this.dropdown) return;
        const isActive = this.dropdown.classList.toggle('active');
        if (isActive) {
            await this.markAllAsRead();
        }
    }

    async markAllAsRead() {
        try {
            await fetch("/api/notifications/mark-read", { method: "POST" });
            // Local update to reflect immediately
            this.notifications.forEach(n => n.is_read = true);
            this.updateBadge();
        } catch (e) {
            console.error("Error marking as read:", e);
        }
    }

    async removeNotification(id) {
        try {
            // Frontend ID format is "notif-123"
            const numericId = id.replace('notif-', '');
            await fetch(`/api/notifications/${numericId}`, { method: "DELETE" });
            this.notifications = this.notifications.filter(n => String(n.id) !== numericId);
            this.render();
        } catch (e) {
            console.error("Error deleting notification:", e);
        }
    }

    updateBadge() {
        const unreadCount = this.notifications.filter(n => !n.is_read).length;
        if (unreadCount > 0) {
            this.badge.textContent = unreadCount;
            this.badge.style.display = 'block';
            this.unreadLabel.textContent = unreadCount + ' Unread';
        } else {
            this.badge.style.display = 'none';
            this.unreadLabel.textContent = '0 Unread';
        }
    }

    render() {
        if (!this.container) return;

        if (this.notifications.length === 0) {
            this.container.innerHTML = '<div class="empty-state">No new notifications</div>';
            this.updateBadge();
            return;
        }

        this.container.innerHTML = this.notifications.map(n => `
            <div class="notif-item ${n.is_read ? '' : 'unread'}" id="notif-${n.id}">
                <div class="notif-icon ${n.status}">
                    <i class="${this.getIcon(n.status)}"></i>
                </div>
                <div class="notif-content">
                    <div class="notif-title">${n.title}</div>
                    <div class="notif-desc">${n.message}</div>
                </div>
                <button class="btn-notif-close" onclick="notifManager.removeNotification('notif-${n.id}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');

        this.updateBadge();
    }

    getIcon(status) {
        switch (status) {
            case 'danger': return 'fas fa-exclamation-triangle';
            case 'warning': return 'fas fa-exclamation-circle';
            case 'success': return 'fas fa-check-circle';
            default: return 'fas fa-info-circle';
        }
    }
}

// Global instance
const notifManager = new NotificationManager();
