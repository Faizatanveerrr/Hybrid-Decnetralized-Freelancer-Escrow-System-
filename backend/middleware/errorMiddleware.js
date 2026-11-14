export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  // Errors raised by middleware (e.g. body-parser: 413 payload too large, 400 bad JSON)
  // carry their own status; otherwise fall back to the response status, then 500.
  const errStatus = Number(err.status || err.statusCode);
  const statusCode = errStatus >= 400 && errStatus < 600 ? errStatus : (res.statusCode === 200 ? 500 : res.statusCode);
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
};
