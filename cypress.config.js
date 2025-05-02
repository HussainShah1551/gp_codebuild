const fs = require('fs');
const path = require('path');

module.exports = {
  e2e: {
    baseUrl: 'https://www.google.com',
    supportFile: false,
    specPattern: 'cypress/e2e/**/*.js',
    setupNodeEvents(on, config) {
      on('task', {
        findCsvFile() {
          const downloadsDir = path.join(__dirname, 'cypress', 'downloads');
          if (!fs.existsSync(downloadsDir)) return null;
          const files = fs.readdirSync(downloadsDir)
            .filter(f => f.endsWith('.csv'))
            .map(f => ({
              name: f,
              time: fs.statSync(path.join(downloadsDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);
          return files.length > 0 ? files[0].name : null;
        }
      });
    }
  },
};
