export const validationSchemas = {
  createUser: {
    username: "string|required",
    email: "string|required|email",
    fullName: "string|required",
    password: "string|required|min:8",
    roleId: "string|required",
  },
  login: {
    username: "string|required",
    password: "string|required",
  },
  createChannel: {
    name: "string|required",
    slug: "string|required",
    status: "string|required",
  },
  createAsset: {
    title: "string|required",
    type: "string|required",
    categoryId: "string|required",
    uploadedBy: "string|required",
  },
  createSchedule: {
    programId: "string|required",
    channelId: "string|required",
    startTime: "string|required",
    endTime: "string|required",
  },
  createAlert: {
    title: "string|required",
    message: "string|required",
    severity: "string|required",
  },
};
