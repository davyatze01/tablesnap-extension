/**
 * TableSnap — central configuration.
 * Replace every value containing "REPLACE_WITH" before publishing (scripts/build.py warns about them;
 * `python scripts/build.py --strict` refuses to build while any remain).
 */
export const CONFIG = Object.freeze({
  /** LemonSqueezy checkout link of the "TableSnap Pro" product (Products → Share → Checkout URL). */
  CHECKOUT_URL: 'https://REPLACE_WITH_STORE.lemonsqueezy.com/buy/REPLACE_WITH_VARIANT_UUID',

  /** Review pages (fill in after the first publication, once the store IDs exist). */
  STORE_REVIEW_URL: 'https://chromewebstore.google.com/detail/REPLACE_WITH_CHROME_EXTENSION_ID/reviews',
  EDGE_REVIEW_URL: 'https://microsoftedge.microsoft.com/addons/detail/REPLACE_WITH_EDGE_PRODUCT_ID',

  /** GitHub Pages site served from /docs. */
  WEBSITE_URL: 'https://REPLACE_WITH_GITHUB_USER.github.io/tablesnap-extension/',
  PRIVACY_URL: 'https://REPLACE_WITH_GITHUB_USER.github.io/tablesnap-extension/privacy.html',

  /** LemonSqueezy License API (public endpoints, no secret key in the extension). */
  LEMONSQUEEZY_API_BASE: 'https://api.lemonsqueezy.com/v1/licenses',
  LEMONSQUEEZY_API_ORIGIN: 'https://api.lemonsqueezy.com/*',
  /** Set both to numbers (Settings → Stores / Products) to reject keys sold by other LemonSqueezy stores. */
  LEMONSQUEEZY_STORE_ID: null,
  LEMONSQUEEZY_PRODUCT_ID: null,

  /** Licensing behaviour. */
  REVALIDATE_INTERVAL_DAYS: 7,
  OFFLINE_GRACE_DAYS: 30,

  /** Review prompt shown once, after this many successful exports. */
  REVIEW_PROMPT_AFTER_EXPORTS: 5,
});
