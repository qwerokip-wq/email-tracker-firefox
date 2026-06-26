const PIXEL_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
  0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00,
  0x21, 0xF9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x2C, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3B,
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const PIXEL_HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  ...CORS_HEADERS,
};

function getClientInfo(request) {
  const cf = request.cf || {};
  return {
    ip: request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown',
    userAgent: request.headers.get('User-Agent') || 'unknown',
    country: cf.country || 'unknown',
    referer: request.headers.get('Referer') || '',
  };
}

export { PIXEL_GIF, CORS_HEADERS, PIXEL_HEADERS, getClientInfo };
