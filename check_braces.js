
const fs = require('fs');
const content = fs.readFileSync('server.ts', 'utf8');
let open = 0;
let lines = content.split('\n');
lines.forEach((line, i) => {
  for (let char of line) {
    if (char === '{') open++;
    if (char === '}') open--;
  }
  if (open < 0) {
    console.log(`Mismatch at line ${i + 1}: ${line}`);
    open = 0;
  }
});
console.log(`Final balance: ${open}`);
