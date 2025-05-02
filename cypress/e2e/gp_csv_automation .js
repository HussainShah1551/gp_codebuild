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
      
      // Get today's date
      const today = new Date();
      
      // Create a date object for the first day of the current month
      const firstDayOfCurrentMonth = new Date(today);
      firstDayOfCurrentMonth.setDate(1); // Set to 1st of current month
      
      // Create a date object for the first day of the previous month
      const firstDayOfPreviousMonth = new Date(firstDayOfCurrentMonth);
      firstDayOfPreviousMonth.setMonth(firstDayOfCurrentMonth.getMonth() - 1);
      
      // Create a date object for the last day of the previous month
      // This is one day before the first day of current month
      const lastDayOfPreviousMonth = new Date(firstDayOfCurrentMonth);
      lastDayOfPreviousMonth.setDate(0);
      
      // Store the date objects
      const firstDay = firstDayOfPreviousMonth;
      const lastDay = lastDayOfPreviousMonth;
      
      // Format the dates as YYYY-MM-DD for the input fields
      const firstDayFormatted = firstDay.toISOString().split('T')[0];
      const lastDayFormatted = lastDay.toISOString().split('T')[0];
      
      // For logging purposes
      const thisMonth = today.getMonth();
      const thisYear = today.getFullYear();
      const prevMonth = firstDay.getMonth();
      const prevYear = firstDay.getFullYear();
      
      // For logging purposes
      const previousYear = prevYear;
      const previousMonthIndex = prevMonth;
      const currentMonth = thisMonth;
      const currentYear = thisYear;
      
      // Log both dates with more detail
      cy.log(`First date (1st of previous month): ${firstDayFormatted}`);
      cy.log(`Last date (last day of previous month): ${lastDayFormatted}`);
      
      // Log month names for clarity
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      cy.log(`Date range: ${months[previousMonthIndex]} 1, ${previousYear} to ${months[previousMonthIndex]} ${lastDay.getDate()}, ${previousYear}`);
      cy.log(`Current month: ${months[currentMonth]}, Previous month: ${months[previousMonthIndex]}`);
      
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



