const https = require('https');
https.get('https://base.vn', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const matches = data.match(/font-family[^;\"\}]+(;|\"|\})/g) || [];
        console.log("Direct inline styles:", matches);

        // Find google fonts
        const googleFonts = data.match(/https:\/\/fonts.googleapis.com[^\"\']+/g) || [];
        console.log("Google Fonts:", googleFonts);
    });
});
