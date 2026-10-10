// Test-only signing key; production and development require PACKING_TOKEN_SECRET.
process.env.PACKING_TOKEN_SECRET = 'vitest-only-packing-token-secret-32-bytes-minimum';
