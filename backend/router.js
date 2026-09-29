const express = require('express');
const mongoose = require('mongoose');

// Express 4 does not forward rejected async handlers to error middleware.
module.exports = () => {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => original(path, ...handlers.map(handler =>
      (req, res, next) => {
        if (Object.entries(req.params).some(([key, value]) => ['id', 'uid', 'cid'].includes(key) && !mongoose.isObjectIdOrHexString(value))) return res.status(400).json({ message: 'Invalid ID' });
        return Promise.resolve().then(() => handler(req, res, next)).catch(next);
      }));
  }
  return router;
};
