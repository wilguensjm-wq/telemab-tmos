export function formatApiError(error) {
  const message = error?.response?.data?.error?.message
    || error?.response?.data?.message
    || error?.message
    || "Unexpected API error";
  return message;
}

export function createApiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}
