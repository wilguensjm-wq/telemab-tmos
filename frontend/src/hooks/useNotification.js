import { useContext } from "react";
import { NotificationContext } from "../contexts/NotificationContext";

export function useNotification() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }

  return {
    success: (message, duration) => context.notify(message, "success", duration),
    error: (message, duration) => context.notify(message, "error", duration),
    info: (message, duration) => context.notify(message, "info", duration),
    warning: (message, duration) => context.notify(message, "warning", duration),
  };
}
