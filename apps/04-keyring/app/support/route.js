import { config } from '../../lib/config.js';
import { themes, document_ } from '../../lib/ui.js';

export async function GET() {
  return new Response(
    document_({
      theme: themes[config.theme],
      title: 'Support',
      identity: null,
      nav: config.nav,
      active: '/support',
      body: `
    <div class="wrap" style="padding-top:56px">
      <div class="narrow">
        <p class="eyebrow">Support</p>
        <h1>Support</h1>
        <p class="lede">Trade accounts: support@northwind.example, Monday to Friday, 08:00 to 18:00.</p>
      </div>
    </div>`,
    }),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
