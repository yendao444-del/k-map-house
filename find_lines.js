const fs = require('fs');
const logFilePath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\bad11785-d2e2-4a9a-8c1d-b3e597412597\\.system_generated\\logs\\transcript.jsonl';

try {
    const fileContent = fs.readFileSync(logFilePath, 'utf8');
    const lines = fileContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        try {
            const data = JSON.parse(line);
            
            // Check tool calls
            if (data.tool_calls) {
                for (const tc of data.tool_calls) {
                    if (tc.name === 'view_file' && tc.args && tc.args.AbsolutePath && tc.args.AbsolutePath.includes('demo_doi_soat.html')) {
                        console.log(`Step ${data.step_index}: view_file tool call. Args: ${JSON.stringify(tc.args)}`);
                    }
                }
            }
            
            // Check step results
            if (data.type === 'VIEW_FILE' && data.content && data.content.includes('demo_doi_soat.html')) {
                console.log(`Step ${data.step_index}: view_file result. Content length: ${data.content.length}`);
            }
        } catch (e) {
            // Ignore
        }
    }
} catch (e) {
    console.error(e);
}
