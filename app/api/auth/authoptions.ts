import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { verifyPassword } from '../../../lib/core/crypto.ts';
import { checkLoginAllowed, recordLoginFailure, recordLoginSuccess } from '../../../lib/server/loginLimiter.ts';

// A valid hash of a random string, verified against when the username is wrong so timing does not reveal it.
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  jwt: { maxAge: 8 * 60 * 60 },
  providers: [
    CredentialsProvider({
      name: 'Jellydash',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        const username = credentials?.username ?? '';
        const password = credentials?.password ?? '';
        if (!username || !password) return null;

        if (!checkLoginAllowed(username)) throw new Error('Too many failed attempts. Try again later.');

        const adminUser = process.env.ADMIN_USERNAME ?? '';
        const adminHash = process.env.ADMIN_PASSWORD_HASH;
        const userOk = adminUser.length > 0 && username === adminUser;
        const passOk = verifyPassword(password, userOk ? adminHash : DUMMY_HASH);

        if (userOk && passOk) {
          recordLoginSuccess(username);
          return { id: 'admin', name: adminUser };
        }
        recordLoginFailure(username);
        return null;
      }
    })
  ],
  pages: { signIn: '/' }
};
