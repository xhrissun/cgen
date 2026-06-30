// Returns the underlying error message only outside production, so 500 responses
// don't leak stack traces / driver details (e.g. Mongo connection strings, file
// paths) to the client in production while still being useful in dev logs.
export const errDetail = (error) => {
  // Always log full detail server-side for debugging.
  if (error) console.error(error);
  return process.env.NODE_ENV === 'production' ? undefined : error?.message;
};