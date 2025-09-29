// 汎用エラーフォーマット
export interface AppError {
  message: string;
  details?: string;
  code?: string;
}

export const createAppError = (
  message: string,
  error: any,
  code?: string
): AppError => {
  return {
    message,
    details: error instanceof Error ? error.message : String(error),
    code: code || error.Code || error.code
  };
};
