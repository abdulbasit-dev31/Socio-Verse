module.exports = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 11000) return res.status(409).json({ message: 'This record already exists' });
  if (['ValidationError', 'CastError'].includes(error.name)) return res.status(400).json({ message: 'Invalid request data' });
  if (error.status >= 400 && error.status < 500) return res.status(error.status).json({ message: error.type === 'entity.too.large' ? 'Upload is too large' : error.type === 'entity.parse.failed' ? 'Invalid JSON' : error.message });
  console.error('Request failed:', error.name, error.code || '');
  res.status(500).json({ message: 'Server error. Please try again.' });
};
