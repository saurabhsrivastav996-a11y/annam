/**
 * Shared setup for the end-to-end suite.
 *
 * These run against the real app: real API, real database, real Socket.IO.
 * That is the point — the Jest suite already covers the API in isolation, so
 * what is worth testing here is the parts only a browser exercises.
 */

/** Signs in through the API and seeds the token, skipping the login form. */
Cypress.Commands.add('loginAs', (email, password = 'Test@123') => {
  cy.request('POST', '/api/auth/login', { email, password }).then(({ body }) => {
    window.localStorage.setItem('annam_token', body.token);
  });
});

Cypress.Commands.add('clearCart', () => {
  window.localStorage.removeItem('annam_cart');
});

/** Adds the first available dish from a named restaurant. */
Cypress.Commands.add('addFirstDish', (restaurantName) => {
  cy.request('/api/restaurants').then(({ body }) => {
    const restaurant = body.find((r) => r.name === restaurantName);
    expect(restaurant, `restaurant ${restaurantName}`).to.exist;
    cy.visit(`/restaurant/${restaurant._id}`);
    cy.contains('button', 'Add').first().click();
  });
});

// A failed asset or an aborted socket during teardown should not fail a test.
Cypress.on('uncaught:exception', (err) => !/ResizeObserver|Network Error/.test(err.message));
