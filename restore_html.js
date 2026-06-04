const fs = require('fs');
const path = require('path');

const logFilePath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\bad11785-d2e2-4a9a-8c1d-b3e597412597\\.system_generated\\logs\\transcript.jsonl';
const targetPath = 'g:\\PHONG TRO\\app\\demo_doi_soat.html';

try {
    const fileContent = fs.readFileSync(logFilePath, 'utf8');
    const lines = fileContent.split('\n');
    let bestHtmlContent = null;
    let maxLen = 0;

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const data = JSON.parse(line);
            
            // Check in tool calls arguments (e.g. write_to_file CodeContent)
            if (data.tool_calls) {
                for (const tc of data.tool_calls) {
                    if (tc.arguments && tc.arguments.CodeContent) {
                        const content = tc.arguments.CodeContent;
                        if (content.includes('<!DOCTYPE html>') && content.includes('AN KHANG HOME') && content.length > maxLen) {
                            bestHtmlContent = content;
                            maxLen = content.length;
                        }
                    }
                }
            }
            
            // Also check inside tool responses output if any
            if (data.content && data.content.includes('<!DOCTYPE html>') && data.content.includes('AN KHANG HOME') && data.content.length > maxLen) {
                // If it is in markdown codeblock, extract it
                const match = data.content.match(/```html([\s\S]+?)```/);
                if (match && match[1].length > maxLen) {
                    bestHtmlContent = match[1];
                    maxLen = match[1].length;
                } else if (data.content.length > maxLen) {
                    bestHtmlContent = data.content;
                    maxLen = data.content.length;
                }
            }
        } catch (e) {
            // Ignore parse errors for partial lines
        }
    }

    if (bestHtmlContent) {
        console.log(`Found healthy backup of demo_doi_soat.html with length: ${bestHtmlContent.length}`);
        fs.writeFileSync(targetPath, bestHtmlContent.trim(), 'utf8');
        console.log('Successfully restored demo_doi_soat.html to target path!');
    } else {
        console.log('No demo_doi_soat.html content found in logs.');
    }
} catch (err) {
    console.error('Error reading log file:', err);
}
