const fs = require('fs');
const logFilePath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\bad11785-d2e2-4a9a-8c1d-b3e597412597\\.system_generated\\logs\\transcript.jsonl';

try {
    const fileContent = fs.readFileSync(logFilePath, 'utf8');
    const lines = fileContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('"step_index":242') || line.includes('"step_index":244')) {
            const data = JSON.parse(line);
            console.log(`Step ${data.step_index} content:`);
            console.log(data.content);
            console.log("------------------------");
        }
    }
} catch (e) {
    console.error(e);
}
