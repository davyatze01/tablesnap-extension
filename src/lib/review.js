/**
 * "Win-Ask" review loop: count successful exports silently; ask for a review once, after N wins.
 */

export function shouldShowReview(state, threshold = 5) {
  return !!state && !state.reviewPromptShown && Number(state.exportCount || 0) >= threshold;
}

export async function getReviewState(storage) {
  const d = (await storage.get(['exportCount', 'reviewPromptShown'])) || {};
  return { exportCount: Number(d.exportCount || 0), reviewPromptShown: !!d.reviewPromptShown };
}

export async function recordExport(storage) {
  const s = await getReviewState(storage);
  const next = { exportCount: s.exportCount + 1, reviewPromptShown: s.reviewPromptShown };
  await storage.set({ exportCount: next.exportCount });
  return next;
}

export async function markReviewShown(storage, now = Date.now()) {
  await storage.set({ reviewPromptShown: true, reviewPromptShownAt: now });
}

export function reviewUrl(config, userAgent) {
  return /\bEdg\//.test(String(userAgent || '')) ? config.EDGE_REVIEW_URL : config.STORE_REVIEW_URL;
}
