/**
 * The customer journey, end to end in a real browser.
 *
 * These cover the parts the Jest suite cannot: routing, cart persistence
 * across pages, the checkout form, and that placing an order actually lands
 * the customer on their tracking page. Every regression asserted here was a
 * real bug at some point.
 */
describe('ordering', () => {
  beforeEach(() => {
    cy.clearCart();
    cy.loginAs('customer@annam.dev');
  });

  it('browses from the home feed to a restaurant menu', () => {
    cy.visit('/');
    cy.contains('h1', 'Scroll into flavour');

    // Scope to the restaurant grid: the name also appears in reel captions,
    // where clicking opens the viewer rather than navigating.
    cy.get('a[href^="/restaurant/"]').contains('Spice Bites').click();
    cy.url().should('include', '/restaurant/');
    cy.contains('h2', 'Menu');
    cy.contains('Butter Chicken');
  });

  it('keeps the cart when moving between pages', () => {
    cy.addFirstDish('Spice Bites');

    cy.visit('/');
    cy.visit('/cart');

    cy.contains('Your cart');
    cy.contains('Butter Chicken');
  });

  it('refuses to mix two restaurants without asking first', () => {
    cy.addFirstDish('Spice Bites');
    cy.addFirstDish('Green Leaf Kitchen');

    // The confirmation, not a silently replaced cart.
    cy.contains('Start a new cart?');
    cy.contains('button', 'Keep cart').click();

    cy.visit('/cart');
    cy.contains('Spice Bites');
  });

  it('places an order and lands on live tracking', () => {
    cy.addFirstDish('Spice Bites');
    cy.visit('/checkout');

    cy.get('textarea').clear().type('Hitech City Rd, Hyderabad');
    // The address resolves to a pin before the order can carry coordinates.
    cy.contains('Location pinned', { timeout: 15000 });

    cy.contains('button', 'Place order').click();

    // Regression: clearing the cart used to bounce the customer to /cart.
    cy.url({ timeout: 15000 }).should('include', '/order/');
    cy.contains('Order placed');
    cy.contains('Live tracking');
  });

  it('books an order for later, and can cancel it before the kitchen starts', () => {
    cy.addFirstDish('Spice Bites');
    cy.visit('/checkout');

    cy.get('textarea').clear().type('Hitech City Rd, Hyderabad');
    cy.contains('Location pinned', { timeout: 15000 });

    cy.contains('button', 'Schedule for later').click();
    // Three hours out: comfortably past prep and the ride from Banjara Hills.
    const slot = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${slot.getFullYear()}-${pad(slot.getMonth() + 1)}-${pad(slot.getDate())}T${pad(slot.getHours())}:${pad(slot.getMinutes())}`;
    cy.get('input[aria-label="Delivery time"]').type(local);

    cy.contains('button', 'Schedule order').click();

    cy.url({ timeout: 15000 }).should('include', '/order/');
    cy.contains('Scheduled for');
    cy.contains('button', 'Cancel order').click();
    cy.contains('Order cancelled');
  });

  it('shows the order in history afterwards', () => {
    cy.visit('/orders');
    cy.contains('h1', 'My orders');
    cy.get('a[href^="/order/"]').should('have.length.greaterThan', 0);
  });

  it('sends a signed-out visitor to log in before checkout', () => {
    cy.window().then((win) => win.localStorage.removeItem('annam_token'));
    cy.addFirstDish('Spice Bites');

    cy.visit('/cart');
    cy.contains('button', 'Log in to checkout').click();
    cy.url().should('include', '/login');
  });
});
