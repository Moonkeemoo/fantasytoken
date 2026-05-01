export type ErrorCode =
  | 'AUTH_INVALID_INIT_DATA'
  | 'AUTH_MISSING_INIT_DATA'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'INVALID_LINEUP'
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_COINS'
  | 'CONTEST_CLOSED'
  | 'CONTEST_NOT_OPEN'
  | 'CONTEST_FULL'
  | 'INTERNAL';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public override readonly cause?: unknown;
  /** Structured payload surfaced on the wire alongside `code` + `message`. Used
   * for actionable errors like INSUFFICIENT_COINS where the client needs to
   * know how much is required vs current to render a top-up CTA. */
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus = 400,
    cause?: unknown,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    if (cause !== undefined) this.cause = cause;
    if (details !== undefined) this.details = details;
  }
}

export const errors = {
  invalidInitData: () => new AppError('AUTH_INVALID_INIT_DATA', 'Invalid initData', 401),
  missingInitData: () => new AppError('AUTH_MISSING_INIT_DATA', 'Missing initData header', 401),
  forbidden: () => new AppError('FORBIDDEN', 'Forbidden', 403),
  notFound: (resource: string) => new AppError('NOT_FOUND', `${resource} not found`, 404),
  contestNotOpen: () => new AppError('CONTEST_NOT_OPEN', 'Contest is not open for entries', 409),
  invalidLineup: (cause?: unknown) => new AppError('INVALID_LINEUP', 'Invalid lineup', 400, cause),
  insufficientBalance: () => new AppError('INSUFFICIENT_BALANCE', 'Insufficient balance', 402),
  /** TZ-002: paid contest entry attempted with too few coins. `required` and
   * `current` ride along on the wire so the frontend can prefill the
   * top-up sheet ("Need 250 more 🪙"). */
  insufficientCoins: (required: number, current: number) =>
    new AppError('INSUFFICIENT_COINS', 'Insufficient coins', 402, undefined, {
      required,
      current,
    }),
  contestClosed: () => new AppError('CONTEST_CLOSED', 'Contest is closed for entries', 409),
  /** Pre-lock real-entry cap reached. Surfaces `current` and `cap` so the
   * lobby UI can disable the JOIN button accurately for late arrivals. */
  contestFull: (current: number, cap: number) =>
    new AppError('CONTEST_FULL', 'Contest is full', 409, undefined, { current, cap }),
  internal: (msg: string, cause?: unknown) => new AppError('INTERNAL', msg, 500, cause),
};
