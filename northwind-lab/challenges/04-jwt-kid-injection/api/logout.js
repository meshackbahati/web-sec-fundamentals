import { redirect } from './_lib.js';

export function POST() {
  return redirect('/', {
    'set-cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  });
}
