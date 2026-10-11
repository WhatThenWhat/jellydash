// Usage: docker run --rm -it ghcr.io/whatthenwhat/jellydash-multi node scripts/hash-password.mjs
// Prints an ADMIN_PASSWORD_HASH value. In compose files, escape each $ as $$.
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, output: process.stderr });
rl.question('Admin password: ', (pw) => {
  rl.close();
  if (!pw || pw.length < 12) {
    console.error('Use at least 12 characters.');
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  const value = ['scrypt', 16384, 8, 1, salt.toString('base64'), hash.toString('base64')].join('$');
  console.log(value);
  console.error('\nIn a compose file, write each $ as $$:\n' + value.replaceAll('$', '$$$$'));
});
