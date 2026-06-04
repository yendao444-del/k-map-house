const fs = require('fs');
const logFilePath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\bad11785-d2e2-4a9a-8c1d-b3e597412597\\.system_generated\\logs\\transcript.jsonl';

try {
    const fileContent = fs.readFileSync(logFilePath, 'utf8');
    const lines = fileContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('<!DOCTYPE html>') || line.includes('AN KHANG HOME - Premium')) {
            console.log(`Line ${i}: matches. Length: ${line.length}`);
            if (line.length > 500) {
                console.log("Snippet: " + line.substring(0, 300) + '...');
            }
        }
    }
} catch (e) {
    console.error(e);
}
