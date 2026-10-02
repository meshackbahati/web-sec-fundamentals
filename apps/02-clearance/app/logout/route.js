export async function POST() {
  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    },
  });
}
