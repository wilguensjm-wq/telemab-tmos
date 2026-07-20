import { useContext } from "react";
import { NotificationContext } from "../../contexts/NotificationContext";
import "../../styles/notifications.css";

export default function NotificationDisplay() {
  const { notifications, dismiss } = useContext(NotificationContext);

  return (
    <div className="notification-container">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`notification notification-${notification.type}`}
          role="alert"
          aria-live="polite"
        >
          <div className="notification-content">
            <p className="notification-message">{notification.message}</p>
            <button
              className="notification-close"
              onClick={() => dismiss(notification.id)}
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
