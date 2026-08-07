import { createContext, useCallback, useState } from "react";

export const NotificationContext = createContext();

let notificationCounter = 0;

function buildNotificationId() {
  notificationCounter += 1;
  return `${Date.now()}-${notificationCounter}`;
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const notify = useCallback((message, type = "info", duration = 4000) => {
    const id = buildNotificationId();
    const notification = { id, message, type };

    setNotifications((prev) => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, notify, dismiss }}>
      {children}
    </NotificationContext.Provider>
  );
}
