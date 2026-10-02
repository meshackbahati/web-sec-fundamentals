import { page } from './_lib.js';
export function GET(request) {
  return page(request, { title: 'Cart', identity: null, body: `<h1>Your cart</h1><p class="lede">Your cart is empty.</p>` });
}
