const fs = require('fs');

const logFilePath = 'C:\\Users\\Admin\\.gemini\\antigravity-ide\\brain\\bad11785-d2e2-4a9a-8c1d-b3e597412597\\.system_generated\\logs\\transcript.jsonl';
const targetPath = 'g:\\PHONG TRO\\app\\demo_doi_soat.html';

try {
    const fileContent = fs.readFileSync(logFilePath, 'utf8');
    const lines = fileContent.split('\n');

    let part1 = ''; // Lines 1 to 800
    let part2 = ''; // Lines 800 to 1181

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const data = JSON.parse(line);
            
            // Look for VIEW_FILE step content
            if (data.type === 'VIEW_FILE' && data.content) {
                const content = data.content;
                if (content.includes('<!DOCTYPE html>')) {
                    console.log(`Found Part 1 in step ${data.step_index}`);
                    // Clean up line numbers in the printed output
                    part1 = cleanOutput(content);
                } else if (content.includes('roomDb = [') || content.includes('closeRoomModal()')) {
                    console.log(`Found Part 2 in step ${data.step_index}`);
                    part2 = cleanOutput(content);
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    if (part1) {
        console.log(`Part 1 cleaned length: ${part1.length}`);
        console.log(`Part 2 cleaned length: ${part2.length}`);
        
        // Assemble parts
        // Note: Part 1 goes from line 1 to 800. Part 2 goes from 800 to 1181. 
        // We split by newline, merge them around index 800.
        const part1Lines = part1.split('\n');
        const part2Lines = part2.split('\n');
        
        console.log(`Part 1 lines: ${part1Lines.length}, Part 2 lines: ${part2Lines.length}`);
        
        // Let's combine them. Since line 800 is printed at the end of Part 1 and start of Part 2,
        // we can slice Part 1 up to index 799, and then add Part 2 lines.
        const finalLines = [...part1Lines.slice(0, 799), ...part2Lines];
        console.log(`Combined lines: ${finalLines.length}`);
        
        const finalHtml = finalLines.join('\n');
        fs.writeFileSync(targetPath, finalHtml, 'utf8');
        console.log('RECONSTRUCTION COMPLETED SUCCESSFULLY!');
    } else {
        console.log('Failed to find Part 1 in logs.');
    }
} catch (e) {
    console.error(e);
}

function cleanOutput(text) {
    // The printed output contains headers and formatted lines:
    // "1: <!DOCTYPE html>\n2: <html lang=\"vi\">\n..."
    // We need to parse each line and strip the line number prefix "1: ", "2: ", etc.
    const lines = text.split('\n');
    const cleaned = [];
    
    let isCodeArea = false;
    for (const line of lines) {
        // Find where the code lines start
        if (line.includes('The following code has been modified to include a line number')) {
            isCodeArea = true;
            continue;
        }
        if (line.includes('NOTE: The output was truncated') || line.includes('The above content does NOT show')) {
            isCodeArea = false;
            continue;
        }
        
        if (isCodeArea) {
            // Match "123:  some code" or "123: some code"
            const match = line.match(/^\s*\d+:\s?(.*)$/);
            if (match) {
                cleaned.push(match[1]);
            } else {
                // If there's no match but it's in the code area, keep the line as is
                cleaned.push(line);
            }
        }
    }
    
    return cleaned.join('\n');
}
