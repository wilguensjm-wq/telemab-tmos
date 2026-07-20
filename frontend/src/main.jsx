import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import NotificationDisplay from "./components/common/NotificationDisplay";
import router from "./routes/router";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <UserProvider>
        <NotificationProvider>
          <RouterProvider router={router} />
          <NotificationDisplay />
        </NotificationProvider>
      </UserProvider>
    </AuthProvider>
  </StrictMode>,
);
