// utils/error-handler.js
class AppError extends Error {
  constructor(message, code, userMessage) {
    super(message);
    this.code = code;
    this.userMessage = userMessage || message;
    this.timestamp = new Date().toISOString();
  }
}

window.safeAsync = async function (fn, options = {}) {
  const { userMessage = 'Đã xảy ra lỗi', showToast = true, rethrow = false } = options;
  
  try {
    return await fn();
  } catch (err) {
    const appErr = err instanceof AppError ? err : new AppError(err.message, 'UNKNOWN', userMessage);
    
    console.error(`❌ [${appErr.code}]`, appErr);
    
    if (showToast && typeof window.showToast === 'function') {
      window.showToast(appErr.userMessage, 'error');
    }
    
    if (rethrow) throw appErr;
    return null;
  }
};
