const limits = { fullName: 100, username: 20, email: 254, identifier: 254, phone: 30, country: 30, gender: 30, dob: 10, password: 72, current: 72, bio: 200, location: 200, text: 10000, mediaType: 10, privacy: 10 };
const mediaPattern = /^data:(image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm|ogg));base64,[A-Za-z0-9+/]+={0,2}$/;
function validMedia(value, imagesOnly = false) {
  return typeof value === 'string' && value.length <= Math.ceil((imagesOnly ? 1.5e6 : 3e6) / 3) * 4 + 100 && mediaPattern.test(value) && (!imagesOnly || value.startsWith('data:image/'));
}
function validate(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ message: 'Expected a JSON object' });
  for (const [key, max] of Object.entries(limits)) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > max)) return res.status(400).json({ message: `Invalid ${key} (maximum ${max} characters)` });
  }
  for (const key of ['password', 'current']) if (typeof body[key] === 'string' && Buffer.byteLength(body[key]) > 72) return res.status(400).json({ message: 'Password must not exceed 72 bytes' });
  for (const key of ['isPrivate', 'remember']) if (body[key] !== undefined && typeof body[key] !== 'boolean') return res.status(400).json({ message: `Invalid ${key}` });
  for (const key of ['media', 'avatar', 'cover']) {
    if (body[key] != null && body[key] !== '' && !validMedia(body[key], key !== 'media')) return res.status(400).json({ message: 'Use a supported image/video: 3MB maximum for posts/stories, 1.5MB for profile pictures' });
  }
  if (body.media) body.mediaType = body.media.startsWith('data:video/') ? 'video' : 'image';
  if (req.query.q !== undefined && (typeof req.query.q !== 'string' || req.query.q.length > 100)) return res.status(400).json({ message: 'Invalid search query' });
  next();
}
module.exports = { validate, validMedia };
