import jwt from 'jsonwebtoken';

export function getBearerToken(req) {
  const header = String(req.headers.authorization || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

export function verifyRequestToken(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    const error = new Error('JWT_SECRET is missing in server/.env');
    error.status = 500;
    throw error;
  }

  try {
    return jwt.verify(token, jwtSecret);
  } catch {
    const error = new Error('Invalid or expired token');
    error.status = 401;
    throw error;
  }
}
