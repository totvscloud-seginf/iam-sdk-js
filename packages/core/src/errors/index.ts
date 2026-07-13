export class IamSdkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class TokenInvalidError extends IamSdkError {
  constructor(message = "Current token is not valid or is expired") {
    super(message);
  }
}

export class NotAuthorizedError extends IamSdkError {
  constructor(message = "You do not have permission to make this request") {
    super(message);
  }
}

export class InvalidRequestError extends IamSdkError {
  readonly statusCode: number;
  readonly responseBody?: unknown;

  constructor(statusCode = 500, message = "Invalid API request", responseBody?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

export class TransportError extends IamSdkError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class UnsupportedCapabilityKeyError extends IamSdkError {
  constructor() {
    super("Capability keys are not supported by IAM frontend authorizations v1; use action instead.");
  }
}
