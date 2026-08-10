/**
 * SHM Bridge — Toast Notification Manager
 * A lightweight, theme-aware toast system with no external dependencies.
 *
 * Usage:
 *   window.SHMToast.show("Pesan notifikasi", "danger", "Judul Opsional", 5000);
 *
 * Types: 'success' | 'warning' | 'danger' | 'info'
 */
class SHMToastManager {
    constructor() {
        this.container = null;
        this._cooldowns = {};  // Prevent duplicate toasts
        this._init();
    }

    _init() {
        // Find or create the container
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    /**
     * Show a toast notification.
     * @param {string} message  - Main body text
     * @param {string} type     - 'success' | 'warning' | 'danger' | 'info'
     * @param {string} title    - Optional title override (auto-set from type if empty)
     * @param {number} duration - Auto-dismiss after ms (default 4500). 0 = no auto-dismiss.
     */
    show(message, type = 'info', title = '', duration = 4500) {
        // De-duplicate: same message+type only shows once per 3 seconds
        const key = `${type}:${message}`;
        if (this._cooldowns[key]) return;
        this._cooldowns[key] = true;
        setTimeout(() => delete this._cooldowns[key], 3000);

        const defaults = {
            success: { title: 'Berhasil', icon: 'fa-check-circle' },
            warning: { title: 'Peringatan', icon: 'fa-exclamation-triangle' },
            danger: { title: 'Koneksi Error', icon: 'fa-times-circle' },
            info: { title: 'Informasi', icon: 'fa-info-circle' },
        };

        const cfg = defaults[type] || defaults.info;
        const toastTitle = title || cfg.title;
        const iconClass = cfg.icon;

        // Build element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${iconClass}"></i>
            </div>
            <div class="toast-body">
                <div class="toast-title">${toastTitle}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="Tutup">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Close button handler
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this._dismiss(toast);
        });

        this.container.appendChild(toast);

        // Trigger CSS slide-in (next tick so transition works)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('toast-visible');
            });
        });

        // Auto-dismiss
        if (duration > 0) {
            const timer = setTimeout(() => this._dismiss(toast), duration);

            // Pause timer on hover
            toast.addEventListener('mouseenter', () => clearTimeout(timer));
            toast.addEventListener('mouseleave', () => {
                setTimeout(() => this._dismiss(toast), 1500);
            });
        }
    }

    _dismiss(toast) {
        if (!toast || toast.classList.contains('toast-hiding')) return;
        toast.classList.add('toast-hiding');
        toast.addEventListener('animationend', () => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, { once: true });
    }

    // Convenience shortcuts
    success(msg, title = '', duration = 4000) { this.show(msg, 'success', title, duration); }
    warning(msg, title = '', duration = 5000) { this.show(msg, 'warning', title, duration); }
    danger(msg, title = '', duration = 6000) { this.show(msg, 'danger', title, duration); }
    info(msg, title = '', duration = 4000) { this.show(msg, 'info', title, duration); }

    /**
     * Watch a sensor for data staleness.
     *
     * Behaviour:
     *  - If no data arrives within `timeoutMs` → persistent danger toast appears.
     *  - If user CLOSES the toast manually and sensor still silent
     *    → toast reappears after `reappearAfterMs` (default 5 min).
     *  - If new data arrives → toast dismissed automatically + success toast shown.
     *
     * @param {object} options
     *   @param {string} options.sensorName       - e.g. "Anemometer anm2d01"
     *   @param {number} options.timeoutMs        - Staleness threshold ms (default 60000)
     *   @param {number} options.checkMs          - Check interval ms (default 5000)
     *   @param {number} options.reappearAfterMs  - Re-show delay after manual close ms (default 300000 = 5 min)
     *
     * @returns {{ update: Function, stop: Function }}
     */
    watchSensor({ sensorName = 'Sensor', timeoutMs = 60000, checkMs = 5000, reappearAfterMs = 300000 } = {}) {
        let lastSeen = Date.now();
        let alerted = false;   // true = toast is (or was) shown for current outage
        let dismissed = false;   // true = user closed the toast manually
        let dismissedAt = 0;       // timestamp when user closed it
        let activeToast = null;    // reference to the current toast DOM element
        let stopped = false;

        const _showAlert = (elapsedMs) => {
            const secs = Math.round(elapsedMs / 1000);
            const msg = `${sensorName} tidak mengirim data selama ${secs} detik`;

            // Skip de-duplication by using show() directly with forced key clear
            delete this._cooldowns[`danger:${msg}`];

            // Build toast element ourselves so we can attach a dismiss listener
            // Reuse internal show() – just clear cooldown first
            this.show(msg, 'danger', 'Sensor Terputus', 0);

            // Grab the newest danger toast in the container to track it
            const container = document.getElementById('toast-container');
            if (container) {
                const toasts = container.querySelectorAll('.toast-danger');
                activeToast = toasts[toasts.length - 1] || null;

                if (activeToast) {
                    // Detect manual close via close-button click
                    const closeBtn = activeToast.querySelector('.toast-close');
                    if (closeBtn) {
                        closeBtn.addEventListener('click', () => {
                            dismissed = true;
                            dismissedAt = Date.now();
                            activeToast = null;
                        }, { once: true });
                    }
                }
            }
        };

        const intervalId = setInterval(() => {
            if (stopped) return;
            const elapsed = Date.now() - lastSeen;

            if (elapsed >= timeoutMs) {
                if (!alerted) {
                    // First alert for this outage
                    alerted = true;
                    dismissed = false;
                    _showAlert(elapsed);

                } else if (dismissed && (Date.now() - dismissedAt) >= reappearAfterMs) {
                    // User dismissed earlier, reappear delay has passed → show again
                    dismissed = false;
                    _showAlert(elapsed);
                }
            }
        }, checkMs);

        return {
            /**
             * Call every time fresh sensor data arrives.
             * Resets the timer and shows a recovery toast if sensor was flagged.
             */
            update() {
                lastSeen = Date.now();
                if (alerted) {
                    alerted = false;
                    dismissed = false;

                    // Dismiss the active persistent toast if still on screen
                    if (activeToast && !activeToast.classList.contains('toast-hiding')) {
                        activeToast.classList.add('toast-hiding');
                    }
                    // Also sweep any remaining danger toasts
                    const container = document.getElementById('toast-container');
                    if (container) {
                        container.querySelectorAll('.toast-danger').forEach(t => {
                            if (!t.classList.contains('toast-hiding')) {
                                t.classList.add('toast-hiding');
                            }
                        });
                    }
                    activeToast = null;

                    window.SHMToast.success(
                        `${sensorName} kembali terhubung`,
                        'Sensor Online',
                        5000
                    );
                }
            },
            /** Stop watching — call when page/chart is disposed. */
            stop() {
                stopped = true;
                clearInterval(intervalId);
            }
        };
    }
}

// Expose global instance (safe to call on any page)
window.SHMToast = new SHMToastManager();
