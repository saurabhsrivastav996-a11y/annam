/**
 * The donation loop, which is the part of Annam that is actually novel.
 *
 * Runs a restaurant posting surplus food and a volunteer claiming it, through
 * the interface rather than the API, because the claim is a race and the UI is
 * where a double-claim would show up.
 */
describe('annadevta', () => {
  it('shows the public impact figures to anyone', () => {
    cy.visit('/annadevta');

    cy.contains('h1', 'Annadevta');
    cy.contains('Meals rescued');
    cy.contains('Awaiting pickup');
  });

  it('lets a restaurant post surplus food', () => {
    cy.loginAs('restaurant@annam.dev');
    cy.visit('/dashboard/restaurant');

    cy.contains('button', 'Annadevta').click();
    cy.contains('Post surplus food');

    const description = `E2E test surplus ${Date.now()}`;
    cy.get('textarea').first().clear().type(description);
    cy.get('input[type=number]').first().clear().type('9');
    cy.contains('button', 'Post donation').click();

    cy.contains(description, { timeout: 15000 });
    cy.contains('Posted');
  });

  it('lets a volunteer claim a pickup and walk it to completion', () => {
    cy.loginAs('volunteer@annam.dev');
    cy.visit('/annadevta');

    cy.contains('button', 'Accept pickup', { timeout: 15000 }).first().click();
    cy.contains('Pickup accepted', { timeout: 15000 });

    cy.contains('button', 'My pickups').click();
    cy.contains('button', 'Mark collected', { timeout: 15000 }).first().click();
    cy.contains('button', 'Mark distributed', { timeout: 15000 }).first().click();

    cy.contains('Completed');
  });

  it('tells a customer that claiming is for volunteers', () => {
    cy.loginAs('customer@annam.dev');
    cy.visit('/annadevta');

    cy.contains('Volunteer accounts can claim these pickups');
    cy.contains('button', 'Accept pickup').should('not.exist');
  });
});
