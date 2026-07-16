export class TmosError extends Error {
  constructor({ code = "INTERNAL_ERROR", message = "Internal error", status = 500, details = {} }) {
    super(message);
    this.name = "TmosError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}