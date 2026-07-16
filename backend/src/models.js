export const UserRole = {
  ADMINISTRATOR: "Administrator",
  PRODUCER: "Producer",
  EDITOR: "Editor",
  JOURNALIST: "Journalist",
  OPERATOR: "Operator",
};

export const EntityTypes = {
  USER: "user",
  ROLE: "role",
  PERMISSION: "permission",
  CHANNEL: "channel",
  LIVE_STREAM: "live_stream",
  VIDEO_ASSET: "video_asset",
  PLAYLIST: "playlist",
  SCHEDULE: "schedule",
  PROGRAM: "program",
  CATEGORY: "category",
  ANALYTICS: "analytics",
  ALERT: "alert",
  AI_CONVERSATION: "ai_conversation",
  AUDIT_LOG: "audit_log",
  SYSTEM_SETTING: "system_setting",
};

export const UserModel = {
  id: "uuid",
  username: "string",
  email: "string",
  passwordHash: "string",
  fullName: "string",
  roleId: "uuid",
  status: "active | pending | suspended",
  lastLoginAt: "timestamp",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

export const RoleModel = {
  id: "uuid",
  name: "string",
  description: "string",
  isSystem: "boolean",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

export const PermissionModel = {
  id: "uuid",
  name: "string",
  resource: "string",
  action: "string",
  description: "string",
  createdAt: "timestamp",
};

export const ChannelModel = {
  id: "uuid",
  name: "string",
  slug: "string",
  status: "live | standby | recording | offline",
  encoderId: "string",
  bitrate: "string",
  resolution: "string",
  viewerCount: "number",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

export const LiveStreamModel = {
  id: "uuid",
  channelId: "uuid",
  transport: "rtmp | hls | srt",
  health: "healthy | warning | degraded",
  bitrate: "string",
  uptime: "string",
  startedAt: "timestamp",
  endedAt: "timestamp",
  createdAt: "timestamp",
};

export const VideoAssetModel = {
  id: "uuid",
  title: "string",
  type: "video | image | audio",
  categoryId: "uuid",
  duration: "string",
  filePath: "string",
  checksum: "string",
  status: "draft | approved | review | archived",
  uploadedBy: "uuid",
  uploadedAt: "timestamp",
  createdAt: "timestamp",
};

export const PlaylistModel = {
  id: "uuid",
  name: "string",
  description: "string",
  ownerId: "uuid",
  assetIds: "uuid[]",
  isPublished: "boolean",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

export const ScheduleModel = {
  id: "uuid",
  programId: "uuid",
  channelId: "uuid",
  startTime: "timestamp",
  endTime: "timestamp",
  status: "scheduled | live | queued | completed",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

export const ProgramModel = {
  id: "uuid",
  title: "string",
  description: "string",
  categoryId: "uuid",
  duration: "string",
  status: "draft | scheduled | live | archived",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

export const CategoryModel = {
  id: "uuid",
  name: "string",
  slug: "string",
  parentId: "uuid",
  createdAt: "timestamp",
};

export const AnalyticsModel = {
  id: "uuid",
  metricName: "string",
  metricValue: "string",
  targetValue: "string",
  trend: "string",
  recordedAt: "timestamp",
  createdAt: "timestamp",
};

export const AlertModel = {
  id: "uuid",
  title: "string",
  message: "string",
  severity: "info | warning | critical",
  acknowledged: "boolean",
  createdAt: "timestamp",
};

export const AIConversationModel = {
  id: "uuid",
  userId: "uuid",
  threadTitle: "string",
  status: "open | in_review | resolved",
  priority: "low | medium | high",
  createdAt: "timestamp",
  updatedAt: "timestamp",
};

export const AuditLogModel = {
  id: "uuid",
  actorId: "uuid",
  entityType: "string",
  entityId: "uuid",
  action: "string",
  metadata: "json",
  createdAt: "timestamp",
};

export const SystemSettingModel = {
  id: "uuid",
  key: "string",
  value: "string",
  description: "string",
  updatedAt: "timestamp",
};
