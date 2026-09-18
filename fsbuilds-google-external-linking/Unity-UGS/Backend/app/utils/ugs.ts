const axios = require('axios');
const jwt = require('jsonwebtoken');
const jwktopem = require('jwk-to-pem');

// Module-level cache variables
let cachedJWKS: any = null;
let lastFetchTime: number = 0;
const CACHE_DURATION: number = 4 * 60 * 60 * 1000; // 24 hours in milliseconds
const UNITY_JWKS_URL: string = 'https://api.prd.identity.corp.unity3d.com/.well-known/jwks.json';
const UNITY_AUTH_URL: string = `https://services.api.unity.com/auth/v1/token-exchange?projectId=${process.env.UGS_PROJECT_ID}&environmentId=${process.env.UGS_ENV_ID}`;
const UNITY_SCRIPT_URL: string = `https://cloud-code.services.api.unity.com/v1/projects/${process.env.UGS_PROJECT_ID}/scripts/VirtualPurchase`;

export async function tokenExchange() {
  const res = await axios.post(UNITY_AUTH_URL,
    {},
    {
      headers: {
        'Authorization': `Basic ${process.env.UGS_SERVICE_ACCOUNT_SECRET}`
      }
    }
  )

  return res.data;
}

export async function virtualPurchase(accessToken, playerId, productId) {
  const res = await axios.post(UNITY_SCRIPT_URL,
    { params: { playerId, productId } },
    { headers: { 'Authorization': `Bearer ${accessToken}`} }
  );

  return res.data;
}

async function fetchJWKS() {
  try {
    const response = await axios.get(UNITY_JWKS_URL);
    cachedJWKS = response.data;
    lastFetchTime = Date.now();

    return cachedJWKS;
  } catch (error) {
    throw new Error('Failed to fetch JWKS from Unity identity service');
  }
}

const SPEND_COINS_URL: string = `https://cloud-code.services.api.unity.com/v1/projects/${process.env.UGS_PROJECT_ID}/scripts/SpendCoins`;
const EARN_COINS_URL: string = `https://cloud-code.services.api.unity.com/v1/projects/${process.env.UGS_PROJECT_ID}/scripts/EarnCoins`;

export async function spendCoins(accessToken, playerId, amount) {
  const res = await axios.post(SPEND_COINS_URL,
    { params: { playerId, amount } },
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  return res.data;
}

export async function earnCoins(accessToken, playerId, amount) {
  const res = await axios.post(EARN_COINS_URL,
    { params: { playerId, amount } },
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  return res.data;
}

export async function validateUnityToken(token: string) {
  let decodedToken = jwt.decode(token, { complete: true });

  let kid = decodedToken.header.kid;
  const jwks = await getJWKS();

  const key = jwks?.keys.find((k) => k.kid === kid);  
  const publicKey = jwktopem(key);

  // Pin the allowed algorithm explicitly rather than letting jwt.verify
  // infer it from the token's own header — the classic JWT algorithm-
  // confusion class of bug relies on exactly that inference. The key here
  // is, by definition, public (served from Unity's JWKS), so only the
  // signature algorithm needs pinning, not the key's secrecy.
  const payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

  return payload.sub
}

async function getJWKS() {
  const now = Date.now();


  // If we have cached JWKS and it's not expired, use it
  if (cachedJWKS && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedJWKS;
  }

  // Otherwise, fetch fresh JWKS
  return await fetchJWKS();
}

const EARN_EGGS_URL: string = `https://cloud-code.services.api.unity.com/v1/projects/${process.env.UGS_PROJECT_ID}/scripts/EarnEggs`;

export async function earnEggs(accessToken, playerId, score) {
  const res = await axios.post(EARN_EGGS_URL,
    { params: { playerId, score } },
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  return res.data;
}

export async function grantCurrency(accessToken, playerId, currencyId, amount) {
  const url = `https://economy.services.api.unity.com/v2/projects/${process.env.UGS_PROJECT_ID}/players/${playerId}/currencies/${currencyId}/increment`;
  const res = await axios.post(url,
    { amount },
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  return res.data;
}

const CHECK_LEVEL_UP_URL: string = `https://cloud-code.services.api.unity.com/v1/projects/${process.env.UGS_PROJECT_ID}/scripts/CheckLevelUp`;

export async function checkLevelUp(accessToken, playerId, xpEarned) {
  const res = await axios.post(CHECK_LEVEL_UP_URL,
    { params: { playerId, xpEarned } },
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  return res.data;
}