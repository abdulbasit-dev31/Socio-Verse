const jwt = require('jsonwebtoken'); const User = require('../models/User');
module.exports = async (req, res, next) => {
  try {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
    const { id, v = 0 } = jwt.verify(match?.[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = await User.findById(id); if (!req.user || req.user.tokenVersion !== v) throw new Error();
    next();
  } catch { res.status(401).json({ message: 'Not authorized, please login again' }); }
};
