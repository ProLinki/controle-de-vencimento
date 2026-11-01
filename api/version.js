module.exports = async (req, res) => {
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
  const msg = process.env.VERCEL_GIT_COMMIT_MESSAGE || '';
  res.status(200).json({ sha, message: msg });
};