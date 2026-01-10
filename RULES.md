# Project Rules

## Development Workflow

1. **Automated Verification**:
   - After any fix or feature implementation, you MUST perform an automated test (using browser tools or scripts) to verify the change works as expected.
   - Do not rely solely on build success.
   - Verify related features to ensure no regressions (e.g., if fixing edit, check create).

2. **Code Quality**:
   - Ensure no unused imports or variables remain.
   - Maintain consistent formatting.

3. **Deployment**:
   - Always verify locally (`npm run build`, `npm run dev`) before deploying.
