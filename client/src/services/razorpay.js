const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loader = null;

/**
 * Loads Razorpay Checkout on demand, once per tab.
 * Kept out of index.html so the script is only fetched by customers who
 * actually reach checkout with online payment available.
 */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => {
        loader = null; // let a later attempt retry
        reject(new Error('Could not load Razorpay Checkout. Check your connection.'));
      };
      document.body.appendChild(script);
    });
  }

  return loader;
}
