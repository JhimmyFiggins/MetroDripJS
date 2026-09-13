const fs = require('fs');

const data = fs.readFileSync('figma_node.json', 'utf16le').replace(/^\uFEFF/, '');
const json = JSON.parse(data);

const root = json.nodes['63:2'].document;

function parseNode(node, depth = 0) {
    let result = '  '.repeat(depth) + `- [${node.type}] ${node.name}`;
    if (node.type === 'TEXT') {
        result += ` (Text: "${node.characters.replace(/\n/g, '\\n')}")`;
    }
    if (node.fills && node.fills.length > 0 && node.fills[0].color) {
        const c = node.fills[0].color;
        result += ` (Color: rgba(${Math.round(c.r*255)}, ${Math.round(c.g*255)}, ${Math.round(c.b*255)}, ${c.a}))`;
    }
    
    let childrenText = [];
    if (node.children) {
        for (const child of node.children) {
            childrenText.push(parseNode(child, depth + 1));
        }
    }
    if (childrenText.length > 0) {
        return result + '\n' + childrenText.join('\n');
    }
    return result;
}

const summary = parseNode(root);
fs.writeFileSync('figma_summary.txt', summary, 'utf8');
console.log("Summary generated.");
