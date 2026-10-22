import axios from "axios";

// Every page loads its dropdowns/tables with a single request on mount. When
// the API is restarting (or a proxy hiccups) that one request used to fail and
// the page stayed empty until the user refreshed. Reads are now retried with a
// growing delay; anything that changes data is never retried automatically.

const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 700;

// "Reads" that are POSTs only because they carry filters in the body.
const SAFE_POSTS =
  /\/api\/(data|bank-mapping-data|store-data|filter-options|bofa-data|bofa-accounts|check-transactions)$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRepeatable = (config) => {
  const method = (config.method || "get").toLowerCase();
  if (method === "get") return true;
  const url = String(config.url || "").split("?")[0];
  return method === "post" && SAFE_POSTS.test(url);
};

// a hung request must fail (and be retried) rather than spin forever
axios.defaults.timeout = 180000;

axios.interceptors.request.use((config) => {
  // uploads of big files legitimately take longer than any fixed timeout
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.timeout = 0;
  }
  return config;
});

axios.interceptors.response.use(undefined, async (error) => {
  const config = error?.config;
  if (!config || axios.isCancel(error) || !isRepeatable(config)) {
    throw error;
  }

  const status = error.response?.status;
  const retriable = error.response
    ? RETRY_STATUS.has(status)
    : true; // network error / timeout: nothing reached us

  const attempt = (config.__retryCount || 0) + 1;
  // a request that timed out is only worth one more try, not four
  const limit = error.code === "ECONNABORTED" ? 1 : MAX_RETRIES;
  if (!retriable || attempt > limit) throw error;

  config.__retryCount = attempt;
  const retryAfter = Number(error.response?.headers?.["retry-after"]);
  const delay =
    (retryAfter > 0 ? retryAfter * 1000 : BASE_DELAY_MS * 2 ** (attempt - 1)) +
    Math.random() * 250;
  await sleep(Math.min(delay, 8000));
  return axios(config);
});
