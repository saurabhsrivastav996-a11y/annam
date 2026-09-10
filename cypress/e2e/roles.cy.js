/**
 * Each role sees its own part of the app, and nobody else's.
 *
 * The API tests already prove the server refuses the wrong role; these prove
 * the interface agrees, which is where a mismatch would actually be noticed.
 */
describe('roles', () => {
  it('sends each role to its own landing page after login', () => {
    const landings = [
      ['restaurant@annam.dev', '/dashboard/restaurant', 'Spice Bites'],
      ['delivery@annam.dev', '/dashboard/delivery', 'Deliveries'],
      ['volunteer@annam.dev', '/annadevta', 'Annadevta'],
      ['admin@annam.dev', '/dashboard/admin', 'Admin'],
    ];

    landings.forEach(([email, path, heading]) => {
      cy.visit('/login');
      cy.get('input[type=email]').clear().type(email);
      cy.get('input[type=password]').clear().type('Test@123');
      cy.get('form').first().submit();

      cy.url({ timeout: 15000 }).should('include', path);
      cy.contains(heading);

      cy.window().then((win) => win.localStorage.clear());
    });
  });

  it('keeps a customer out of the admin dashboard', () => {
    cy.loginAs('customer@annam.dev');
    cy.visit('/dashboard/admin');

    cy.contains('Not available for your role');
    cy.contains('signed in as');
  });

  it('sends an anonymous visitor to login for a protected page', () => {
    cy.visit('/orders');
    cy.url().should('include', '/login');
  });

  it('lets anyone browse the public pages signed out', () => {
    cy.visit('/');
    cy.contains('Scroll into flavour');

    cy.visit('/reels');
    cy.contains('h1', 'Food Reels');

    cy.visit('/annadevta');
    cy.contains('h1', 'Annadevta');

    // No forced redirect to login on a public page.
    cy.url().should('include', '/annadevta');
  });

  it('shows a restaurant its own kitchen dashboard', () => {
    cy.loginAs('restaurant@annam.dev');
    cy.visit('/dashboard/restaurant');

    cy.contains('Spice Bites');
    ['Orders', 'Insights', 'Menu', 'Reels', 'Annadevta', 'Profile'].forEach((tab) => {
      cy.contains('button', tab);
    });
  });

  it('shows a restaurant its own numbers under Insights', () => {
    cy.loginAs('restaurant@annam.dev');
    cy.visit('/dashboard/restaurant');
    cy.contains('button', 'Insights').click();

    // Revenue is the food only; the delivery fee belongs to the courier.
    cy.contains('the ₹30 delivery fee is not yours');
    cy.contains('Revenue');
    cy.contains('Average order');

    // Changing the window re-queries rather than filtering what is on screen.
    cy.intercept('GET', '**/analytics?days=7').as('week');
    cy.contains('button', '7 days').click();
    cy.wait('@week').its('response.statusCode').should('eq', 200);
  });
});
