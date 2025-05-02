// cypress/e2e/google_spec.js

// Ignore specific uncaught exceptions from the app so Cypress does not fail the test
Cypress.on('uncaught:exception', (err, runnable) => {
  if (
    err.message.includes('getContext') ||
    err.message.includes('knob is not a function') ||
    err.message.includes('Morris is not defined') ||
    err.message.includes('colorpicker is not a function')
  ) {
    return false; // prevents Cypress from failing the test
  }
});




describe('Gym Passport Login', () => {
  it('should open Gym Passport in a headless browser', () => {
    cy.visit('https://gympassport.pk/sign-in');
    cy.title().should('include', 'Gym Passport');

    cy.get('#email').type('gympassport@emumba.com');
    cy.get('input[name="password"]').type('Gym@123');
    cy.get('input[type="submit"]').click();


    cy.contains('Dashboard').should('be.visible');
    cy.wait(2000);
    cy.get('a[href="https://gympassport.pk/employees"]').first().click();

    cy.contains('Employee Management').should('be.visible');
      
      // Get the current month and year
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();

      // Create date for 1st of current month
      const firstDay = new Date(currentYear, currentMonth, 1);
      const firstDayFormatted = firstDay.toISOString().split('T')[0];

      // Create date for the last day of current month
      // Setting day to 0 of next month gives the last day of current month
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      const lastDayFormatted = lastDay.toISOString().split('T')[0];
      
      cy.log(`First day of month: ${firstDayFormatted}`);
      cy.log(`Last day of month: ${lastDayFormatted}`);
      
      cy.get('input[type="date"]').first().type(firstDayFormatted);
      cy.get('input[type="date"]').last().type(lastDayFormatted);
      
      // Click on the select dropdown with ID filter_type
      cy.get('#status').select(1);
      
      cy.get('#filter_type').select(2);
      
      cy.wait(2000);
      cy.get('#submit').click();
      
      cy.wait(4000);
      cy.get('.dt-button.buttons-collection.buttons-page-length').click();
      cy.get('.dt-button.button-page-length').then($btns => {
        cy.wrap($btns[$btns.length - 2]).click();
     

    cy.get('.dt-button.buttons-csv.buttons-html5').click();

    cy.wait(4000); // wait for download to start
cy.task('findCsvFile', {}, { timeout: 20000 }).then((filename) => {
  cy.readFile(`cypress/downloads/${filename}`).should('exist');
});
  
  });


  });
});



