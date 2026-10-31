// Errors that are safe to show to the caller. Anything else is treated as unexpected and the
// HTTP layer answers with a generic 500 (details go to the server log only).

export class ClientError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ClientError";
  }
}
