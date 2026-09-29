// Per-process protection for the demo server. Multi-instance deployments need a shared store.
module.exports = ({ limit = 30, windowMs = 15 * 60000 } = {}) => {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, entry] of clients) if (entry.expires <= now) clients.delete(key);
    const key = req.ip;
    const entry = clients.get(key) || { count: 0, expires: now + windowMs };
    clients.set(key, entry); entry.count++;
    if (entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.expires - now) / 1000)));
      return res.status(429).json({ message: 'Too many attempts. Please try again later.' });
    }
    next();
  };
};
