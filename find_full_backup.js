const fs = require('fs');
const logFilePath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\bad11785-d2e2-4a9a-8c1d-b3e597412597\\.system_generated\\logs\\transcript.jsonl';

try {
    const fileContent = fs.readFileSync(logFilePath, 'utf8');
    const lines = fileContent.split('\n');
    let foundFullContent = null;
    let maxLen = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        try {
            const data = JSON.parse(line);
            
            // Search inside tool calls
            if (data.tool_calls) {
                for (const tc of data.tool_calls) {
                    if (tc.name === 'write_to_file' && tc.args && tc.args.CodeContent) {
                        const content = tc.args.CodeContent;
                        if (tc.args.TargetFile && tc.args.TargetFile.includes('demo_doi_soat.html')) {
                            console.log(`Found G-Fonts write_to_file in step ${data.step_index} with length ${content.length}`);
                            if (content.length > maxLen) {
                                foundFullContent = content;
                                maxLen = content.length;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    if (foundFullContent) {
        console.log(`FOUND FULL BACKUP! Length: ${foundFullContent.length}`);
        fs.writeFileSync('g:\\PHONG TRO\\app\\demo_doi_soat.html', foundFullContent.trim(), 'utf8');
        console.log('Restored successfully!');
    } else {
        console.log('No full backup found in logs.');
    }
} catch (e) {
    console.error(e);
}
