const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const vehicleImages = [
    { name: 'sh.png', url: 'https://hondaxemay.com.vn/uploads/2023/12/SH160i-125i-2024-Den-Nham-1.png' },
    { name: 'vision.png', url: 'https://hondaxemay.com.vn/uploads/2023/12/Vision-2024-Phien-ban-The-thao-Den.png' },
    { name: 'ab.png', url: 'https://hondaxemay.com.vn/uploads/2023/12/Air-Blade-160-2024-Xanh-Xam.png' },
    { name: 'wave.png', url: 'https://hondaxemay.com.vn/uploads/2023/11/Wave-Alpha-2024-Trang.png' },
    { name: 'winner.png', url: 'https://hondaxemay.com.vn/uploads/2023/12/Winner-X-2024-Phien-ban-The-thao-Do-Den.png' },
    { name: 'exciter.png', url: 'https://yamaha-motor.com.vn/wp/wp-content/uploads/2023/09/Exciter-155-VVA-ABS-Xanh-Bac-Den-1.png' },
    { name: 'sirius.png', url: 'https://yamaha-motor.com.vn/wp/wp-content/uploads/2023/07/Sirius-RC-Vanh-Duc-Phanh-Dia-Xam-Den-1.png' },
    { name: 'nvx.png', url: 'https://yamaha-motor.com.vn/wp/wp-content/uploads/2023/10/NVX-155-VVA-Xanh-Den-1.png' },
    { name: 'vespa.png', url: 'https://www.vespa.com/etc.clientlibs/vespa/clientlibs/clientlib-site/resources/assets/vespa_primavera_125_ebianco_innocente.png' },
    { name: 'vinfast.png', url: 'https://shop.vinfastauto.com/on/demandware.static/-/Sites-app_vinfast_vn-Library/default/dwe0cb27d8/images/xe-may-dien/evo200/xe-may-evo200-lite-do-tuoi.png' },
    { name: 'bicycle.png', url: 'https://file.hstatic.net/200000384351/file/xe_dap_the_thao_fascino_828_xc_f52ab74d9e0747cb98ce4ce542dc2156.png' },
    { name: 'default.png', url: 'https://hondaxemay.com.vn/uploads/2023/12/Lead-125cc-2024-Xanh-Dam.png' }
];

const destFolder = path.join(__dirname, 'src', 'renderer', 'src', 'assets', 'vehicles');
if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, rejectUnauthorized: false }, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            } else if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 308) {
                download(response.headers.location, dest).then(resolve).catch(reject);
            } else {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            }
        }).on('error', (err) => { fs.unlink(dest, () => { }); reject(err); });
    });
}

async function run() {
    for (const img of vehicleImages) {
        console.log(`Downloading ${img.name}...`);
        try {
            await download(img.url, path.join(destFolder, img.name));
            console.log(`Success: ${img.name}`);
        } catch (e) {
            console.log(`Failed: ${img.name} - ${e.message}`);
        }
    }
}
run();
