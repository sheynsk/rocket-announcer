// Backwards-compatible wrapper for the main app exe builder.
import { execSync } from 'child_process';

try {
  execSync('node build-app-exe.js', { stdio: 'inherit' });
} catch (e) {
  console.error('build-app-exe failed:', e.message);
  process.exit(1);
}
