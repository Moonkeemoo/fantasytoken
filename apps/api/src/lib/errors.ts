export type ErrorCode =
  | 'AUTH_INVALID_INIT_DATA'
  | 'AUTH_MISSING_INIT_DATA'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'CONTEST_NOT_OPEN'
  | 'INTERNAL';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public override readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, httpStatus = 400, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    if (cause !== undefined) this.cause = cause;
  }
}

export const errors = {
  invalidInitData: () => new AppError('AUTH_INVALID_INIT_DATA', 'Invalid initData', 401),
  missingInitData: () => new AppError('AUTH_MISSING_INIT_DATA', 'Missing initData header', 401),
  notFound: (resource: string) => new AppError('NOT_FOUND', `${resource} not found`, 404),
  contestNotOpen: () => new AppError('CONTEST_NOT_OPEN', 'Contest is not open for entries', 409),
};
