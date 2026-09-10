/**
 * Captures the README screenshots.
 *
 * Not part of the test suite — it asserts almost nothing. It exists because
 * screenshots taken by hand go stale the moment the UI moves, and because a
 * few of these shots need real state behind them (an order actually out for
 * delivery, a volunteer actually matched to surplus) that would be tedious to
 * set up by clicking.
 *
 *   npm run shots
 *
 * Output lands in docs/screenshots/.
 */

const PASSWORD = 'Test@123';

/** Signs in through the API and returns the bearer token. */
function tokenFor(email) {
  return cy
    .request('POST', '/api/auth/login', { email, password: PASSWORD })
    .then(({ body }) => body.token);
}

/** Puts a token in localStorage so the SPA boots signed in. */
function signIn(email) {
  return tokenFor(email).then((token) => {
    window.localStorage.setItem('annam_token', token);
    return token;
  });
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** Waits for the network to settle, then shoots. */
function shoot(name) {
  cy.wait(1200);
  cy.screenshot(name, { capture: 'viewport', overwrite: true });
}

/**
 * Blocks until OpenStreetMap has actually painted tiles.
 *
 * Without this the map screenshots come out as a grey rectangle with a route
 * line floating on it — Leaflet renders immediately and fills in tiles over
 * the network afterwards.
 */
function waitForMapTiles() {
  cy.get('.leaflet-container', { timeout: 15000 }).should('exist');
  cy.get('.leaflet-tile-loaded', { timeout: 25000 }).should('have.length.greaterThan', 0);
  // One tile back means the rest are in flight; give them time to paint.
  cy.wait(2500);
}

describe('README screenshots', () => {
  it('discover feed', () => {
    signIn('customer@annam.dev');
    cy.visit('/');
    cy.contains('h1', 'Scroll into flavour');
    cy.get('a[href^="/restaurant/"]').should('have.length.greaterThan', 0);
    shoot('01-discover');
  });

  it('reels', () => {
    signIn('customer@annam.dev');
    cy.visit('/reels');
    // Give the first clip a moment to paint a frame rather than a black box.
    cy.get('video', { timeout: 15000 }).should('exist');
    cy.wait(2500);
    cy.screenshot('02-reels', { capture: 'viewport', overwrite: true });
  });

  it('natural-language search', () => {
    signIn('customer@annam.dev');
    cy.visit('/search');
    cy.get('input[aria-label="Search dishes"]').type('something spicy under 300');
    cy.contains('button', 'Search').click();
    // The parsed-filter chips are the point of the shot.
    cy.contains('Looking for:');
    shoot('03-search');
  });

  it('restaurant menu', () => {
    signIn('customer@annam.dev');
    cy.request('/api/restaurants').then(({ body }) => {
      const r = body.find((x) => x.name === 'Spice Bites') || body[0];
      cy.visit(`/restaurant/${r._id}`);
    });
    cy.contains('h2', 'Menu');
    shoot('04-restaurant');
  });

  it('order tracking, out for delivery', () => {
    // A tracking page is only interesting once something is actually moving,
    // so drive a real order through the kitchen and onto a courier first.
    let orderId;

    tokenFor('customer@annam.dev').then((customer) => {
      cy.request('/api/restaurants').then(({ body }) => {
        const r = body.find((x) => x.name === 'Spice Bites') || body[0];
        cy.request(`/api/restaurants/${r._id}`).then(({ body: full }) => {
          const dish = (full.menu || full.items || []).find((d) => d.isAvailable !== false);
          cy.request({
            method: 'POST',
            url: '/api/orders',
            headers: auth(customer),
            body: {
              restaurantId: r._id,
              items: [{ foodId: dish._id, qty: 2 }],
              deliveryAddress: 'Koramangala 5th Block, Bengaluru',
              paymentMethod: 'cod',
            },
          }).then(({ body: order }) => {
            orderId = order._id;

            tokenFor('restaurant@annam.dev').then((kitchen) => {
              for (const status of ['Accepted', 'Preparing', 'Ready']) {
                cy.request({
                  method: 'PUT',
                  url: `/api/orders/${orderId}/status`,
                  headers: auth(kitchen),
                  body: { status },
                });
              }
            });

            // Pickup needs the OTP, and only the customer can read it — the
            // courier is meant to be told it at the door. So fetch it as the
            // customer, exactly as a real handover would.
            cy.request({
              url: `/api/orders/${orderId}/otp`,
              headers: auth(customer),
            }).then(({ body: { otp } }) => {
              tokenFor('delivery@annam.dev').then((courier) => {
                cy.request({
                  method: 'PUT',
                  url: `/api/orders/${orderId}/accept`,
                  headers: auth(courier),
                });
                cy.request({
                  method: 'PUT',
                  url: `/api/orders/${orderId}/status`,
                  headers: auth(courier),
                  body: { status: 'OutForDelivery', otp },
                });
              });
            });

            signIn('customer@annam.dev').then(() => {
              cy.visit(`/order/${orderId}`);
              cy.contains('On the way');
              waitForMapTiles();
              // Nudge down so the map is in frame rather than clipped by the fold.
              cy.scrollTo(0, 120);
              shoot('05-tracking');
            });
          });
        });
      });
    });
  });

  it('annadevta matching', () => {
    signIn('volunteer@annam.dev');
    cy.visit('/annadevta');
    cy.contains('Annadevta');
    waitForMapTiles();
    shoot('06-annadevta');
  });

  it('kitchen dashboard', () => {
    signIn('restaurant@annam.dev');
    cy.visit('/dashboard/restaurant');
    // The heading is the kitchen's own name, not a fixed label.
    cy.get('h1').should('be.visible');
    shoot('07-kitchen');
  });

  it('kitchen insights', () => {
    signIn('restaurant@annam.dev');
    cy.visit('/dashboard/restaurant');
    cy.contains('button', 'Insights').click();
    cy.contains('Revenue by day');
    // Bars are painted from the fetched series; wait for one to have height.
    cy.get('[data-chart="revenue"] > div > div', { timeout: 15000 })
      .should('have.length.greaterThan', 0);
    shoot('08-insights');
  });

  it('admin dashboard', () => {
    signIn('admin@annam.dev');
    cy.visit('/dashboard/admin');
    cy.contains('Admin');
    shoot('09-admin');
  });
});
