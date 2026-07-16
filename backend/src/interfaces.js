export const interfaces = {
  User: `{
    id: string;
    username: string;
    email: string;
    fullName: string;
    roleId: string;
    status: 'active' | 'pending' | 'suspended';
    lastLoginAt?: string | null;
    createdAt: string;
    updatedAt: string;
  }`,
  Role: `{
    id: string;
    name: string;
    description: string;
    isSystem: boolean;
    createdAt: string;
    updatedAt: string;
  }`,
  Permission: `{
    id: string;
    name: string;
    resource: string;
    action: string;
    description: string;
    createdAt: string;
  }`,
  Channel: `{
    id: string;
    name: string;
    slug: string;
    status: 'live' | 'standby' | 'recording' | 'offline';
    encoderId: string;
    bitrate: string;
    resolution: string;
    viewerCount: number;
    createdAt: string;
    updatedAt: string;
  }`,
  LiveStream: `{
    id: string;
    channelId: string;
    transport: 'rtmp' | 'hls' | 'srt';
    health: 'healthy' | 'warning' | 'degraded';
    bitrate: string;
    uptime: string;
    startedAt: string;
    endedAt?: string | null;
    createdAt: string;
  }`,
  VideoAsset: `{
    id: string;
    title: string;
    type: 'video' | 'image' | 'audio';
    categoryId: string;
    duration: string;
    filePath: string;
    checksum: string;
    status: 'draft' | 'approved' | 'review' | 'archived';
    uploadedBy: string;
    uploadedAt: string;
    createdAt: string;
  }`,
  Playlist: `{
    id: string;
    name: string;
    description: string;
    ownerId: string;
    assetIds: string[];
    isPublished: boolean;
    createdAt: string;
    updatedAt: string;
  }`,
  Schedule: `{
    id: string;
    programId: string;
    channelId: string;
    startTime: string;
    endTime: string;
    status: 'scheduled' | 'live' | 'queued' | 'completed';
    createdAt: string;
    updatedAt: string;
  }`,
  Program: `{
    id: string;
    title: string;
    description: string;
    categoryId: string;
    duration: string;
    status: 'draft' | 'scheduled' | 'live' | 'archived';
    createdAt: string;
    updatedAt: string;
  }`,
  Category: `{
    id: string;
    name: string;
    slug: string;
    parentId?: string | null;
    createdAt: string;
  }`,
  Analytics: `{
    id: string;
    metricName: string;
    metricValue: string;
    targetValue: string;
    trend: string;
    recordedAt: string;
    createdAt: string;
  }`,
  Alert: `{
    id: string;
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    acknowledged: boolean;
    createdAt: string;
  }`,
  AIConversation: `{
    id: string;
    userId: string;
    threadTitle: string;
    status: 'open' | 'in_review' | 'resolved';
    priority: 'low' | 'medium' | 'high';
    createdAt: string;
    updatedAt: string;
  }`,
  AuditLog: `{
    id: string;
    actorId: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }`,
  SystemSetting: `{
    id: string;
    key: string;
    value: string;
    description: string;
    updatedAt: string;
  }`,
};
