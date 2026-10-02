import { page } from './_lib.js';
export function GET(request) {
  return page(request, { title: 'Support', identity: null, body: `<h1>Support</h1><p class="lede">Trade accounts: support@northwind.example, Monday to Friday.</p>` });
}
