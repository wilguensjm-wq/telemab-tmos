import { createBrowserRouter } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import LoadingScreen from "../components/common/LoadingScreen";
import RouteErrorBoundary from "../components/common/RouteErrorBoundary";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import UserAuthentication from "../pages/UserAuthentication";
import UserManagement from "../pages/UserManagement";
import LiveChannelManager from "../pages/LiveChannelManager";
import MediaIngest from "../pages/MediaIngest";
import MediaLibrary from "../pages/MediaLibrary";
import VideoScheduler from "../pages/VideoScheduler";
import StreamingControl from "../pages/StreamingControl";
import AIAssistant from "../pages/AIAssistant";
import Analytics from "../pages/Analytics";
import Automation from "../pages/Automation";
import SystemHealth from "../pages/SystemHealth";
import SystemSettings from "../pages/SystemSettings";
import Reporters from "../pages/Reporters";
import Studios from "../pages/Studios";
import Assignments from "../pages/Assignments";
import ProducerPresenceDashboard from "../pages/ProducerPresenceDashboard";
import ProducerControlRoom from "../pages/ProducerControlRoom";
import LiveSources from "../pages/LiveSources";
import ProgramSwitcher from "../pages/ProgramSwitcher";
import Developer from "../pages/Developer";
import NotFound from "../pages/NotFound";
import Forbidden from "../pages/Forbidden";
import ProtectedRoute from "./ProtectedRoute";
import { ROLES } from "../utils/roles";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <ProtectedRoute allowedRoles={[ROLES.ADMINISTRATOR, ROLES.OPERATOR, ROLES.ENGINEER, ROLES.PRODUCER]} />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: "home", element: <Dashboard /> },
          { path: "dashboard", element: <Dashboard /> },
          { path: "auth", element: <UserAuthentication /> },
          { path: "security", element: <UserAuthentication /> },
          { path: "users", element: <UserManagement /> },

          { path: "infrastructure/proxmox", element: <SystemHealth /> },
          { path: "infrastructure/ubuntu", element: <SystemHealth /> },
          { path: "infrastructure/docker", element: <Automation /> },
          { path: "infrastructure/portainer", element: <Automation /> },
          { path: "infrastructure/storage", element: <SystemHealth /> },
          { path: "infrastructure/network", element: <SystemHealth /> },
          { path: "infrastructure/dns", element: <SystemSettings /> },

          { path: "broadcast/live-channels", element: <LiveChannelManager /> },
          { path: "broadcast/streaming", element: <StreamingControl /> },
          { path: "broadcast/rtmp", element: <StreamingControl /> },
          { path: "broadcast/hls", element: <StreamingControl /> },
          { path: "broadcast/ffmpeg", element: <MediaIngest /> },
          { path: "broadcast/obs-connections", element: <LiveChannelManager /> },
          { path: "broadcast/playout", element: <VideoScheduler /> },

          { path: "monitoring/uptime-kuma", element: <Analytics /> },
          { path: "monitoring/alerts", element: <Dashboard /> },
          { path: "monitoring/performance", element: <Analytics /> },
          { path: "monitoring/logs", element: <SystemHealth /> },
          { path: "monitoring/incidents", element: <AIAssistant /> },

          { path: "reporter-control/reporters", element: <Reporters /> },
          { path: "reporter-control/producer", element: <ProducerControlRoom /> },
          { path: "reporter-control/live-sources", element: <LiveSources /> },
          { path: "reporter-control/program-switcher", element: <ProgramSwitcher /> },
          { path: "reporter-control/studios", element: <Studios /> },
          { path: "reporter-control/assignments", element: <Assignments /> },
          { path: "reporter-control/presence", element: <ProducerPresenceDashboard /> },

          { path: "ai-operations/engineer", element: <AIAssistant /> },
          { path: "ai-operations/diagnostics", element: <AIAssistant /> },
          { path: "ai-operations/automation", element: <AIAssistant /> },
          { path: "ai-operations/knowledge-base", element: <AIAssistant /> },
          { path: "ai-operations/recommendations", element: <AIAssistant /> },

          { path: "channels", element: <LiveChannelManager /> },
          { path: "master-control", element: <LiveChannelManager /> },
          { path: "media", element: <MediaIngest /> },
          { path: "media-ingest", element: <MediaIngest /> },
          { path: "media-library", element: <MediaLibrary /> },
          { path: "scheduler", element: <VideoScheduler /> },
          { path: "streaming", element: <StreamingControl /> },
          { path: "assistant", element: <AIAssistant /> },
          { path: "ai-ops", element: <AIAssistant /> },
          { path: "analytics", element: <Analytics /> },
          { path: "monitoring", element: <Analytics /> },
          { path: "automation", element: <Automation /> },
          { path: "containers", element: <Automation /> },
          { path: "health", element: <SystemHealth /> },
          { path: "infrastructure", element: <SystemHealth /> },
          { path: "reporters", element: <Reporters /> },
          { path: "producer-control-room", element: <ProducerControlRoom /> },
          { path: "studios", element: <Studios /> },
          { path: "assignments", element: <Assignments /> },
          { path: "presence", element: <ProducerPresenceDashboard /> },
          { path: "settings", element: <SystemSettings /> },
          { path: "administration", element: <SystemSettings /> },
          { path: "developer", element: <Developer /> },
        ],
      },
    ],
  },
  {
    path: "/403",
    element: <Forbidden />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "*",
    element: <NotFound />,
    errorElement: <RouteErrorBoundary />,
  },
]);

export default router;