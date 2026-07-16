export const requestResponseSchemas = {
  LoginRequest: {
    username: "string",
    password: "string",
    rememberMe: "boolean",
  },
  LoginResponse: {
    accessToken: "string",
    refreshToken: "string",
    user: "User",
  },
  UserResponse: {
    id: "string",
    username: "string",
    email: "string",
    fullName: "string",
    role: "Role",
    permissions: "Permission[]",
  },
  ChannelResponse: {
    id: "string",
    name: "string",
    status: "string",
    encoderId: "string",
    bitrate: "string",
    resolution: "string",
    viewerCount: "number",
  },
  AssetResponse: {
    id: "string",
    title: "string",
    type: "string",
    categoryId: "string",
    duration: "string",
    status: "string",
  },
};
