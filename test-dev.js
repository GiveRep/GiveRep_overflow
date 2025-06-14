const { execSync } = require('child_process');
const path = require('path');

console.log('Testing npm run dev...');
console.log('Current directory:', process.cwd());

try {
  // Change to the project directory
  process.chdir('/Users/eason/codes/3MateLabs/GiveRep_overflow');
  console.log('Changed to:', process.cwd());
  
  // Try to run the dev command
  const result = execSync('npm run dev', { 
    encoding: 'utf8',
    stdio: 'pipe'
  });
  console.log('Success:', result);
} catch (error) {
  console.error('Error occurred:');
  console.error('Exit code:', error.status);
  console.error('stdout:', error.stdout?.toString());
  console.error('stderr:', error.stderr?.toString());
  console.error('Message:', error.message);
}