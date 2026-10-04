// Small in-memory sliding-window limiter. Fine for a single process.
export function rateLimit({ windowMs, max, key }) {
  const hits = new Map();

  return (req, res, next) => {
    const id = key(req);
    const now = Date.now();
    const recent = (hits.get(id) ?? []).filter(t => now - t < windowMs);
    recent.push(now);
    hits.set(id, recent);

    if (recent.length > max) {
      return res.status(429).json({ success: false, error: "Too many requests. Slow down." });
    }
    next();
  };
}
